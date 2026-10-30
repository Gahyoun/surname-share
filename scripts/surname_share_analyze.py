"""Estimate first-author surname shares from the stratified OpenAlex samples.

Two corpora are analysed the same way:
  all  : every OpenAlex article, stratified by field x period (S2).
  core : articles in CWTS core sources, stratified by year (S2b). This is the
         primary corpus for trends, because Chinese-language coverage in the
         full index shifts sharply around 2015.

S3: parse the first author's surname (kept rows, audit rows, dropped rows saved).
S4: stratified Hajek estimates overall, by year, and by field x period.
S5: time-series analysis (segmented logit trend, shift-share decompositions).
S6: write docs/data.json for the page.

Every step is logged to data/STEP_LOG.csv.
"""
import csv
import hashlib
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
PAGE = ROOT / "docs"

TARGETS = ["Zhang", "Chen", "Wang", "Guo", "Liu"]
TOP5_CHINA = ["Wang", "Li", "Zhang", "Liu", "Chen"]
CJK = {"张": "Zhang", "張": "Zhang", "陈": "Chen", "陳": "Chen", "王": "Wang", "郭": "Guo", "刘": "Liu", "劉": "Liu", "李": "Li"}
ALIASES = {"Zhang": ["Chang", "Cheung", "Teo"], "Chen": ["Chan", "Tan"], "Wang": ["Wong", "Ong"], "Guo": ["Kuo", "Kwok"], "Liu": ["Liou", "Lau"]}
SINOSPHERE = {"CN", "TW", "HK", "MO", "SG"}
PERIODS = [f"{y}-{y + 4}" for y in range(1975, 2020, 5)] + ["2020-2025"]
Z = 1.959964

PINYIN = re.compile(
    r"^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?"
    r"(?:iang|iong|uang|ang|eng|ing|ong|ian|iao|uai|uan|ai|ao|an|ei|en|er|ia|ie|in|iu|ou|ua|ue|ui|un|uo|a|e|i|o|u))+$"
)


def step(name, n_in, n_out, path):
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest() if Path(path).exists() else ""
    log = OUT / "STEP_LOG.csv"
    is_new = not log.exists()
    with open(log, "a", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        if is_new:
            writer.writerow(["step", "n_in", "n_out", "n_dropped", "file", "sha256"])
        writer.writerow([name, n_in, n_out, n_in - n_out, Path(path).name, digest])


def strip_accents(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text) if not unicodedata.combining(c))


def tokens(name):
    return [t for t in re.split(r"[\s.]+", strip_accents(name).strip()) if t]


def last_token(name):
    t = tokens(name)
    return t[-1].split("-")[-1].title() if t else ""


def is_initial(token):
    return len(token) <= 2 and token.replace("-", "").isupper()


def is_pinyin(token):
    return all(PINYIN.match(part) for part in token.lower().split("-") if part)


def parse_surname(raw, display, countries):
    """Return (surname, rule). The rule name records which name form decided."""
    raw = (raw or "").strip()
    display = display or ""
    if raw and re.fullmatch(r"[一-鿿·]{2,4}", raw):
        return CJK.get(raw[0], raw[0]), "cjk"
    if not raw or len(raw) > 50 or re.search(r"\d|University|Institute|Federal", raw):
        return last_token(display), "display_fallback"
    if "," in raw:
        before = tokens(raw.split(",")[0])
        if before:
            return before[-1].split("-")[-1].title(), "comma"
    t = tokens(raw)
    if not t:
        return last_token(display), "display_fallback"
    if len(t) > 1 and all(is_initial(x) for x in t[1:]):
        return t[0].title(), "trailing_initials"
    if len(t) > 1 and t[0].isupper() and t[0].isalpha() and len(t[0]) > 3 and not t[-1].isupper():
        return t[0].title(), "caps_first"
    last = t[-1].split("-")[-1].title()
    first = t[0].title()
    # Pinyin names are often stored family-name first ("Zhang Wei"). Trust that
    # reading only for pinyin given names with a sinosphere or missing affiliation.
    local = not set(countries) - {""} or SINOSPHERE & set(countries)
    if first in TARGETS + ["Li"] and last not in TARGETS + ["Li"] and len(t) <= 3 and local and all(is_pinyin(x) for x in t[1:]):
        return first, "family_first_pinyin"
    return last, "last_token"


def s3_parse(path_in, label):
    sample = pd.read_csv(path_in, keep_default_na=False, dtype={"work_id": str})
    n_in = len(sample)
    duplicates = sample[sample.duplicated("work_id")]
    sample = sample.drop_duplicates("work_id").copy()
    parsed = [
        parse_surname(r, d, c.split("|"))
        for r, d, c in zip(sample.raw_name, sample.display_name, sample.countries)
    ]
    sample["surname"] = [p[0] for p in parsed]
    sample["rule"] = [p[1] for p in parsed]
    path = OUT / f"S3_parsed_{label}.csv"
    sample.to_csv(path, index=False)
    duplicates.to_csv(OUT / f"S3_parsed_{label}__dropped.csv", index=False)
    step(f"S3_parse_surname_{label}", n_in, len(sample), path)
    hit = sample.surname.isin(TARGETS)
    disagree = sample[hit != sample.display_name.map(last_token).isin(TARGETS)]
    disagree.to_csv(OUT / f"S3_parse_disagreements_{label}.csv", index=False)
    print(label, "hits by rule", sample.rule[hit].value_counts().to_dict(), "disagreements", len(disagree))
    return sample


def prepare_all():
    sample = s3_parse(OUT / "S2_sample.csv", "all")
    strata = pd.read_csv(OUT / "S1_strata.csv")
    strata["field_id"] = strata.field_id.astype(str)
    sample["field_id"] = sample.field_id.astype(str)
    sample["stratum"] = sample.period + "|" + sample.field_id
    strata["stratum"] = strata.period + "|" + strata.field_id
    counts = sample.groupby("stratum").size().rename("n_h").reset_index()
    cells = strata.merge(counts, on="stratum")
    cells["w"] = cells.n_articles / cells.n_h
    merged = sample.merge(cells[["stratum", "field", "n_articles", "n_h", "w"]], on="stratum")
    return merged, int(cells.n_articles.sum())


def prepare_core():
    sample = s3_parse(OUT / "S2b_core_sample.csv", "core")
    exact = pd.read_csv(OUT / "S1b_exact_series.csv").set_index("year")
    sample["stratum"] = sample.year.astype(str)
    sample["period"] = sample.year.map(lambda y: PERIODS[min((y - 1975) // 5, 9)])
    sample["n_articles"] = sample.year.map(exact.core_all)
    sample["n_h"] = sample.groupby("stratum").work_id.transform("size")
    sample["w"] = sample.n_articles / sample.n_h
    return sample, int(exact.core_all.sum())


def hajek(df, flag, domain=None):
    """Weighted share of `flag` within `domain`, with linearised stratified variance."""
    domain = np.ones(len(df), bool) if domain is None else np.asarray(domain)
    flag = np.asarray(flag, float)
    w = df.w.values
    denominator = (w * domain).sum()
    if denominator == 0:
        return np.nan, np.nan, 0.0
    share = (w * domain * flag).sum() / denominator
    z = domain * (flag - share)
    frame = pd.DataFrame({"stratum": df.stratum.values, "z": z, "N": df.n_articles.values, "n": df.n_h.values})
    grouped = frame.groupby("stratum").agg(var=("z", "var"), N=("N", "first"), n=("n", "first"))
    fpc = (1 - grouped.n / grouped.N).clip(lower=0)
    variance = (grouped.N ** 2 * fpc * grouped["var"].fillna(0) / grouped.n).sum() / denominator ** 2
    return float(share), float(np.sqrt(variance)), float(denominator)


def flags(df):
    surname = df.surname.values
    result = {s: surname == s for s in TARGETS}
    result["All five"] = np.isin(surname, TARGETS)
    return result


def s4_estimates(df, corpus):
    is_target = flags(df)
    et_al = df.n_authors.values >= 3
    recent_mask = df.period.values == "2020-2025"

    overall = []
    for label, flag in is_target.items():
        share, se, total = hajek(df, flag)
        strict, strict_se, _ = hajek(df, flag & et_al)
        recent, recent_se, _ = hajek(df, flag, recent_mask)
        overall.append({
            "corpus": corpus, "surname": label, "share": share, "lo": share - Z * se, "hi": share + Z * se,
            "papers": share * total, "et_al_share": strict, "et_al_lo": strict - Z * strict_se,
            "et_al_hi": strict + Z * strict_se, "recent_share": recent,
            "recent_lo": recent - Z * recent_se, "recent_hi": recent + Z * recent_se,
            "hits": int(flag.sum()),
        })

    yearly = []
    for year in range(1975, 2026):
        domain = df.year.values == year
        for label, flag in is_target.items():
            share, se, _ = hajek(df, flag, domain)
            yearly.append({"corpus": corpus, "year": year, "surname": label, "share": share,
                           "lo": max(0.0, share - Z * se), "hi": share + Z * se, "n": int(domain.sum())})

    cross, by_field = [], []
    fields = sorted(f for f in df.field.unique() if f)
    field_values, period_values = df.field.values, df.period.values
    for field in fields:
        in_field = field_values == field
        for label, flag in is_target.items():
            share, se, total = hajek(df, flag, in_field)
            rs, rse, _ = hajek(df, flag, in_field & recent_mask)
            by_field.append({"corpus": corpus, "field": field, "surname": label, "share": share,
                             "n_recent": int((in_field & recent_mask).sum()),
                             "lo": share - Z * se, "hi": share + Z * se, "papers": share * total,
                             "recent_share": rs, "recent_lo": rs - Z * rse, "recent_hi": rs + Z * rse})
            for period in PERIODS:
                domain = in_field & (period_values == period)
                if not domain.any():
                    continue
                share, se, total = hajek(df, flag, domain)
                cross.append({"corpus": corpus, "period": period, "field": field, "surname": label,
                              "hits": int((flag & domain).sum()), "n": int(domain.sum()), "share": share,
                              "lo": max(0.0, share - Z * se), "hi": share + Z * se, "papers": share * total})

    weights = df.groupby("surname").w.sum() / df.w.sum()
    recent = df[recent_mask]
    weights_recent = recent.groupby("surname").w.sum() / recent.w.sum()
    top = lambda s: [{"surname": k, "share": float(v)} for k, v in s.sort_values(ascending=False).head(13).items() if k][:12]

    aliases = []
    surname = df.surname.values
    for target, names in ALIASES.items():
        share, _, _ = hajek(df, surname == target, recent_mask)
        alias_share, _, _ = hajek(df, np.isin(surname, names), recent_mask)
        aliases.append({"surname": target, "aliases": names, "share": share, "alias_share": alias_share})

    china = df.countries.str.split("|").map(lambda c: "CN" in c).values
    top5, top5_se, _ = hajek(df, np.isin(surname, TOP5_CHINA), china & recent_mask)
    five, five_se, _ = hajek(df, is_target["All five"], china & recent_mask)
    validity = {"top5_share": top5, "top5_lo": top5 - Z * top5_se, "top5_hi": top5 + Z * top5_se,
                "five_share": five, "five_lo": five - Z * five_se, "five_hi": five + Z * five_se}

    for name, rows in [("overall", overall), ("yearly", yearly), ("field_period", cross), ("by_field", by_field)]:
        pd.DataFrame(rows).to_csv(OUT / f"S4_{name}_{corpus}.csv", index=False)
    step(f"S4_estimates_{corpus}", len(df), len(cross), OUT / f"S4_field_period_{corpus}.csv")
    return dict(overall=overall, yearly=yearly, cross=cross, by_field=by_field, top_all=top(weights),
                top_recent=top(weights_recent), aliases=aliases, validity=validity)


def segmented(years, y):
    """One-break continuous piecewise-linear fit on logit share; returns break and slopes."""
    best = None
    for tau in range(int(years.min()) + 5, int(years.max()) - 4):
        X = np.column_stack([np.ones_like(years, float), years - tau, np.clip(years - tau, 0, None)])
        beta, *_ = np.linalg.lstsq(X, y, rcond=None)
        sse = ((y - X @ beta) ** 2).sum()
        if best is None or sse < best[0]:
            best = (sse, tau, beta)
    sse, tau, beta = best
    linear = np.polyfit(years, y, 1)
    sse_line = ((y - np.polyval(linear, years)) ** 2).sum()
    return {"break_year": tau, "slope_before": float(beta[1]), "slope_after": float(beta[1] + beta[2]),
            "sse_ratio": float(sse / sse_line)}


def s5_time_series(df, yearly, corpus, start):
    frame = pd.DataFrame(yearly)
    trends = []
    rng = np.random.default_rng(20261031)
    for label in ["All five"] + TARGETS:
        rows = frame[(frame.surname == label) & (frame.share > 0) & (frame.year >= start)]
        years = rows.year.values.astype(float)
        p = rows.share.values
        logit = np.log(p / (1 - p))
        fit = segmented(years, logit)
        se_logit = ((rows.hi - rows.lo) / (2 * Z)).values / (p * (1 - p))
        taus = [segmented(years, logit + rng.normal(0, se_logit))["break_year"] for _ in range(300)]
        recent = years >= 2000
        slopes = [np.polyfit(years[recent], (logit + rng.normal(0, se_logit))[recent], 1)[0] for _ in range(300)]
        fit.update({"growth": float(np.polyfit(years[recent], logit[recent], 1)[0]),
                    "growth_lo": float(np.percentile(slopes, 2.5)), "growth_hi": float(np.percentile(slopes, 97.5))})
        fit.update({"corpus": corpus, "surname": label, "break_lo": int(np.percentile(taus, 2.5)),
                    "break_hi": int(np.percentile(taus, 97.5)), "peak_year": int(rows.loc[rows.share.idxmax(), "year"]),
                    "peak_share": float(rows.share.max())})
        trends.append(fit)

    in_china = df.countries.str.split("|").map(lambda c: "CN" in c).values
    known = (df.countries != "").values
    period_values = df.period.values
    a, b = "2000-2004", "2020-2025"
    decomposition = []
    for label, flag in flags(df).items():
        values = {}
        for period in (a, b):
            mask = (period_values == period) & known
            values[period] = dict(pi=hajek(df, in_china, mask)[0], s_cn=hajek(df, flag, mask & in_china)[0],
                                  s_other=hajek(df, flag, mask & ~in_china)[0], total=hajek(df, flag, mask)[0],
                                  known=hajek(df, known, period_values == period)[0])
        A, B = values[a], values[b]
        mean_gap = (A["s_cn"] - A["s_other"] + B["s_cn"] - B["s_other"]) / 2
        composition = (B["pi"] - A["pi"]) * mean_gap
        change = B["total"] - A["total"]
        decomposition.append({"corpus": corpus, "surname": label, "known_a": A["known"], "known_b": B["known"],
                              "pi_a": A["pi"], "pi_b": B["pi"], "s_cn_a": A["s_cn"], "s_cn_b": B["s_cn"],
                              "s_other_a": A["s_other"], "s_other_b": B["s_other"], "total_a": A["total"],
                              "total_b": B["total"], "change": change, "china_composition": composition,
                              "within": change - composition})

    hit = df.surname.isin(TARGETS).values
    by_period = []
    for period in (a, b):
        sub = df[(period_values == period) & (df.field != "").values]
        h = sub.surname.isin(TARGETS)
        table = pd.DataFrame({"mass": sub.w, "hit": sub.w * h, "field": sub.field}).groupby("field").sum()
        by_period.append(pd.DataFrame({"weight": table.mass / table.mass.sum(), "share": table.hit / table.mass}))
    A, B = by_period
    fields = A.index.intersection(B.index)
    A, B = A.loc[fields], B.loc[fields]
    field_shift = {"between_fields": float(((B.weight - A.weight) * (A.share + B.share) / 2).sum()),
                   "within_fields": float(((B.share - A.share) * (A.weight + B.weight) / 2).sum())}
    pd.DataFrame(trends).to_csv(OUT / f"S5_trends_{corpus}.csv", index=False)
    pd.DataFrame(decomposition).to_csv(OUT / f"S5_decomposition_{corpus}.csv", index=False)
    step(f"S5_time_series_{corpus}", len(frame), len(trends), OUT / f"S5_trends_{corpus}.csv")
    return dict(trends=trends, decomposition=decomposition, field_shift=field_shift)


def main():
    (OUT / "STEP_LOG.csv").unlink(missing_ok=True)
    PAGE.mkdir(parents=True, exist_ok=True)
    corpora = {}
    meta = {}
    for corpus, prepare, start in [("all", prepare_all, 1975), ("core", prepare_core, 1985)]:
        df, population = prepare()
        results = s4_estimates(df, corpus)
        results.update(s5_time_series(df, results["yearly"], corpus, start))
        results["rules"] = df.rule[df.surname.isin(TARGETS)].value_counts().to_dict()
        corpora[corpus] = results
        meta[corpus] = {"n_sample": int(len(df)), "population": population, "n_hits": int(df.surname.isin(TARGETS).sum()),
                        "unfielded": float(df.w[df.field == ""].sum() / df.w.sum())}
    exact = pd.read_csv(OUT / "S1b_exact_series.csv")
    totals = pd.read_csv(OUT / "S1_year_totals.csv")
    exact = exact.merge(totals, on="year")
    meta["periods"] = PERIODS
    meta["population_all_articles"] = int(totals.n_articles.sum())
    data = {"meta": meta, "corpora": corpora, "exact": exact.to_dict("records")}
    path = PAGE / "data.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float))
    step("S6_page_data", len(exact), len(exact), path)
    for corpus, r in corpora.items():
        print("=====", corpus, meta[corpus], r["rules"])
        print(pd.DataFrame(r["overall"]).drop(columns="corpus").round(5).to_string())
        print(pd.DataFrame(r["trends"]).drop(columns="corpus").round(4).to_string())
        print(pd.DataFrame(r["decomposition"]).drop(columns="corpus").round(4).to_string())
        print(r["field_shift"], r["validity"], r["aliases"], [(t["surname"], round(t["share"], 4)) for t in r["top_recent"][:8]], sep="\n")
    core = pd.DataFrame(corpora["core"]["yearly"])
    print(core[core.year >= 1995].pivot(index="year", columns="surname", values="share").round(4).to_string())


if __name__ == "__main__":
    main()
