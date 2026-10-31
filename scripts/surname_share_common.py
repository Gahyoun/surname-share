"""Excess growth of common Chinese surnames as a group, for wider surname sets.

The sets are chosen on one sample and measured on others: rank surnames among
China-affiliated first authors in the pooled core sample (S2d), then measure growth on
the yearly snapshots (S2c) and the field sample (S2e). The overlap is a few dozen works.
Other surname groups serve as placebo and comparison.

S23: define the surname sets.
S24: share and excess growth E by set, overall and among first authors outside China.
S25: E by field for the primary set, heterogeneity, composition null.
S26: write docs/surname-share/common.json for the page.

Usage: python scripts/surname_share_common.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_distribution as dist  # noqa: E402
import surname_share_fields as fields  # noqa: E402

OUT = dist.OUT
PAGE = dist.PAGE
Z = dist.Z
SIZES = [5, 10, 20, 50, 100]
PRIMARY = 100
TWEET = ["Zhang", "Chen", "Wang", "Guo", "Liu"]
KOREAN = ["Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon"]
INDIAN = ["Kumar", "Singh", "Sharma", "Gupta", "Patel", "Das", "Reddy", "Verma"]
VARIANTS = ["Chang", "Cheung", "Chan", "Wong", "Ong", "Teo", "Kuo", "Kwok", "Liou", "Lau", "Hsu", "Tsai", "Hsieh", "Chiu", "Yeh", "Chou", "Chu", "Hung", "Lai", "Ho"]
SPECIFIC = 0.75


def read_flags(name):
    frame = pd.read_csv(OUT / name, keep_default_na=False, dtype={"work_id": str})
    for column in ("known", "china"):
        frame[column] = frame[column].astype(str) == "True"
    return frame


def s23_sets():
    pooled = dist.clean(read_flags("S13_parsed_pooled.csv"), "common_pooled")
    known = pooled[pooled.known]
    china, other = known[known.china], known[~known.china]
    table = pd.DataFrame({"china": china.surname.value_counts(), "other": other.surname.value_counts()}).fillna(0).astype(int)
    table = table.sort_values(["china", "other"], ascending=False)
    table["cumulative"] = table.china.cumsum() / len(china)
    table["rank"] = np.arange(1, len(table) + 1)
    top = {k: list(table.index[:k]) for k in SIZES}
    placebo = [s for s in table.sort_values("other", ascending=False).index if s not in top[PRIMARY] and s not in KOREAN and s not in INDIAN][:PRIMARY]
    groups = {f"중국계 상위 {k}": top[k] for k in SIZES}
    specific = table.loc[top[PRIMARY]]
    specific = specific[specific.china / (specific.china + specific.other) >= SPECIFIC].index.tolist()
    groups["상위 100 중 특이도 높은 성"] = specific
    groups["상위 100 + 표기 변형"] = top[PRIMARY] + [s for s in VARIANTS if s not in top[PRIMARY]]
    groups["트윗 다섯 성"] = TWEET
    groups["한국계 8개"] = KOREAN
    groups["인도계 8개"] = INDIAN
    groups["그 외 상위 100"] = placebo
    path = OUT / "S23_surname_sets.csv"
    table.reset_index(names="surname").head(300).to_csv(path, index=False)
    dist.step("S23_surname_sets", len(table), 300, path)
    within = {"s_china": float(china.surname.isin(top[PRIMARY]).mean()), "s_other": float(other.surname.isin(top[PRIMARY]).mean()), "n_china": len(china), "n_other": len(other)}
    coverage = {k: float(table.cumulative.iloc[k - 1]) for k in SIZES}
    return groups, top, table, within, coverage


def ratio(h1, n1, h2, n2):
    value, variance = fields.log_ratio(h1, n1, h2, n2)
    return float(np.exp(value)), float(np.exp(value - Z * np.sqrt(variance))), float(np.exp(value + Z * np.sqrt(variance)))


def s24_overall(groups):
    snapshots = dist.clean(read_flags("S13_parsed_snapshots.csv"), "common_snapshots")
    exact = pd.read_csv(OUT / "S1b_exact_series.csv").set_index("year")
    first, last = int(snapshots.snapshot.min()), int(snapshots.snapshot.max())
    growth_all = float(exact.core_all[last] / exact.core_all[first])
    a, b = snapshots[snapshots.snapshot == first], snapshots[snapshots.snapshot == last]
    outside_a, outside_b = a[a.known & ~a.china], b[b.known & ~b.china]
    rows, series = [], []
    for label, names in groups.items():
        h1, h2 = int(a.surname.isin(names).sum()), int(b.surname.isin(names).sum())
        e, lo, hi = ratio(h1, len(a), h2, len(b))
        o1, o2 = int(outside_a.surname.isin(names).sum()), int(outside_b.surname.isin(names).sum())
        oe, olo, ohi = ratio(o1, len(outside_a), o2, len(outside_b))
        rows.append({"group": label, "size": len(names), "share_first": h1 / len(a), "share_last": h2 / len(b), "hits_first": h1, "hits_last": h2, "e": e, "lo": lo, "hi": hi,
                     "growth": e * growth_all, "annual": e ** (1 / (last - first)) - 1, "outside_first": o1 / len(outside_a), "outside_last": o2 / len(outside_b),
                     "outside_hits_first": o1, "outside_hits_last": o2, "outside_e": oe, "outside_lo": olo, "outside_hi": ohi})
    for year, group in snapshots.groupby("snapshot"):
        row = {"year": int(year), "n": int(len(group)), "index_all": float(exact.core_all[year] / exact.core_all[first])}
        outside = group[group.known & ~group.china]
        for label, names in groups.items():
            row[label] = float(group.surname.isin(names).mean())
            row[f"{label}|outside"] = float(outside.surname.isin(names).mean())
        row["pi"] = float(group[group.known].china.mean())
        series.append(row)
    frame = pd.DataFrame(rows)
    path = OUT / "S24_common_growth.csv"
    frame.to_csv(path, index=False)
    dist.step("S24_common_growth", len(snapshots), len(frame), path)
    return {"first": first, "last": last, "growth_all": growth_all, "rows": rows, "series": series}


def surname_rows(top, table):
    snapshots = read_flags("S13_parsed_snapshots.csv")
    a, b = snapshots[snapshots.snapshot == snapshots.snapshot.min()], snapshots[snapshots.snapshot == snapshots.snapshot.max()]
    rows = []
    for surname in top[20]:
        h1, h2 = int((a.surname == surname).sum()), int((b.surname == surname).sum())
        e, lo, hi = ratio(h1, len(a), h2, len(b))
        rows.append({"surname": surname, "rank": int(table.loc[surname, "rank"]), "hits_first": h1, "hits_last": h2, "e": e, "lo": lo, "hi": hi})
    return rows


def s25_fields(names, within):
    frame = fields.load()
    _, cells = fields.exact_series()
    frame = frame.assign(hit=frame.surname.isin(names))
    counts = frame.groupby(["level", "key", "name", "period"], as_index=False).agg(n=("work_id", "size"), hits=("hit", "sum"), known=("known", "sum"), china_first=("china", "sum"))
    cell = cells.merge(counts, on=["level", "key", "name", "period"])
    cell["share"] = cell.hits / cell.n
    rows = []
    mean_share = lambda pi: pi * within["s_china"] + (1 - pi) * within["s_other"]
    for (level, name), group in cell.groupby(["level", "name"]):
        group = group.set_index("period")
        p, q = group.loc[fields.EARLY], group.loc[fields.LATE]
        value, variance = fields.log_ratio(p.hits, p.n, q.hits, q.n)
        pi_early, pi_late = p.china_first / p.known, q.china_first / q.known
        rows.append({"level": level, "name": name, "growth_all": float(q.per_year / p.per_year), "share_early": float(p.share), "share_late": float(q.share),
                     "hits_early": int(p.hits), "hits_late": int(q.hits), "log_e": float(value), "var": float(variance), "e": float(np.exp(value)),
                     "lo": float(np.exp(value - Z * np.sqrt(variance))), "hi": float(np.exp(value + Z * np.sqrt(variance))), "growth_group": float(np.exp(value) * q.per_year / p.per_year),
                     "pi_early": float(pi_early), "pi_late": float(pi_late), "e_null": float(mean_share(pi_late) / mean_share(pi_early))})
    growth = pd.DataFrame(rows)
    table = growth[growth.level == "field"]
    weights = 1 / table["var"]
    mean = (weights * table.log_e).sum() / weights.sum()
    q = float((weights * (table.log_e - mean) ** 2).sum())
    df = len(table) - 1
    tau2 = max(0.0, (q - df) / (weights.sum() - (weights ** 2).sum() / weights.sum()))
    random = 1 / (table["var"] + tau2)
    centre = (random * table.log_e).sum() / random.sum()
    se = np.sqrt(1 / random.sum())
    z = (table.log_e - np.log(table.e_null)) / np.sqrt(table["var"])
    hetero = {"Q": q, "df": df, "p": float(stats.chi2.sf(q, df)), "I2": max(0.0, (q - df) / q), "tau": float(np.sqrt(tau2)), "mean_e": float(np.exp(centre)),
              "mean_lo": float(np.exp(centre - Z * se)), "mean_hi": float(np.exp(centre + Z * se)), "above": int((table.lo > 1).sum()), "n": len(table),
              "null_inside": int((z.abs() <= Z).sum()), "ratio_median": float(np.median(table.e / table.e_null)), "chi2_p": float(stats.chi2.sf((z ** 2).sum(), len(table))),
              "growth_rho": float(stats.spearmanr(table.growth_all, table.e).statistic), "growth_p": float(stats.spearmanr(table.growth_all, table.e).pvalue),
              "early_rho": float(stats.spearmanr(table.share_early, table.e).statistic), "early_p": float(stats.spearmanr(table.share_early, table.e).pvalue)}
    ml = cell[cell.name.isin(fields.ML)].assign(mass=lambda t: t.share * t.per_year).groupby("period").agg(mass=("mass", "sum"), per_year=("per_year", "sum"), hits=("hits", "sum"), n=("n", "sum"))
    value, variance = fields.log_ratio(ml.hits[fields.EARLY], ml.n[fields.EARLY], ml.hits[fields.LATE], ml.n[fields.LATE])
    point = float((ml.mass[fields.LATE] / ml.per_year[fields.LATE]) / (ml.mass[fields.EARLY] / ml.per_year[fields.EARLY]))
    ml_row = {"name": "ML 근사 (AI + CV)", "growth_all": float(ml.per_year[fields.LATE] / ml.per_year[fields.EARLY]), "e": point, "lo": float(point * np.exp(-Z * np.sqrt(variance))), "hi": float(point * np.exp(Z * np.sqrt(variance))),
              "share_early": float(ml.mass[fields.EARLY] / ml.per_year[fields.EARLY]), "share_late": float(ml.mass[fields.LATE] / ml.per_year[fields.LATE])}
    path = OUT / "S25_common_fields.csv"
    growth.to_csv(path, index=False)
    dist.step("S25_common_fields", len(frame), len(growth), path)
    return growth, hetero, ml_row


def main():
    groups, top, table, within, coverage = s23_sets()
    overall = s24_overall(groups)
    print(pd.DataFrame(overall["rows"]).round(3).to_string())
    surnames = surname_rows(top, table)
    print(pd.DataFrame(surnames).round(2).to_string())
    print(pd.DataFrame(overall["series"])[["year", "pi", f"중국계 상위 {PRIMARY}", f"중국계 상위 {PRIMARY}|outside", "그 외 상위 100"]].round(3).to_string())
    growth, hetero, ml = s25_fields(top[PRIMARY], within)
    print(growth.sort_values("e", ascending=False)[["level", "name", "growth_all", "share_early", "share_late", "e", "lo", "hi", "e_null", "hits_early"]].round(3).to_string())
    print(hetero, ml, within, coverage, sep="\n")
    data = {"primary": PRIMARY, "sets": {str(k): top[k] for k in SIZES}, "coverage": coverage, "korean": KOREAN, "indian": INDIAN, "variants": VARIANTS, "specific": SPECIFIC, "within": within, "overall": overall, "surnames": surnames,
            "fields": growth.to_dict("records"), "hetero": hetero, "ml": ml}
    path = PAGE / "common.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float, allow_nan=False))
    dist.step("S26_page_data", len(growth), len(growth), path)


if __name__ == "__main__":
    main()
