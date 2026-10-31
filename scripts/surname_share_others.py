"""Excess growth of common Indian and Korean surnames, with the method used for Chinese ones.

Sets are ranked among first authors affiliated with the country in the pooled core sample
(S2d) and measured on the yearly snapshots (S2c) and the field sample (S2e). Common surnames
cross borders: Lee is frequent in China as well as in Korea, Singh and Patel abroad. So shares
are split over three groups (the country, China, the rest), and the null holds each group's
share fixed while only the group sizes change.

S27: define the surname sets for each country.
S28: share and E by set, inside and outside the country, three-group null, shift-share.
S29: E and odds ratio by field for the primary set.
S30: surname table.
S31: write docs/surname-share/others.json for the page.

Usage: python scripts/surname_share_others.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_common as common  # noqa: E402
import surname_share_distribution as dist  # noqa: E402
import surname_share_fields as fields  # noqa: E402

OUT = dist.OUT
PAGE = dist.PAGE
Z = dist.Z
SIZES = [5, 10, 20, 50]
PRIMARY = 20
COUNTRIES = {"IN": {"name": "인도", "hand": common.INDIAN}, "KR": {"name": "한국", "hand": common.KOREAN}}
SPECIFIC = 0.5
EARLY_END = 2009
THIN = 10
N_BOOT = 4000
SEED = 20261104


def has(frame, code):
    return frame.countries.str.split("|").map(lambda c: code in c)


def s27_sets():
    pooled = dist.clean(common.read_flags("S13_parsed_pooled.csv"), "others_pooled")
    known = pooled[pooled.known]
    out, tables = {}, []
    for code, info in COUNTRIES.items():
        inside = known[has(known, code)]
        rest = known[~has(known, code)]
        table = pd.DataFrame({"inside": inside.surname.value_counts(), "outside": rest.surname.value_counts()}).fillna(0).astype(int)
        table = table.sort_values(["inside", "outside"], ascending=False)
        table["cumulative"] = table.inside.cumsum() / len(inside)
        table["rank"] = np.arange(1, len(table) + 1)
        table["specificity"] = table.inside / (table.inside + table.outside)
        name = info["name"]
        top = {k: list(table.index[:k]) for k in SIZES}
        groups = {f"{name} 상위 {k}": top[k] for k in SIZES}
        groups[f"{name} 상위 {PRIMARY} 중 특이도 높은 성"] = [s for s in top[PRIMARY] if table.specificity[s] >= SPECIFIC]
        early = inside[inside.year.astype(int) <= EARLY_END].surname.value_counts()
        groups[f"{name} 2000–09 기준 상위 {PRIMARY}"] = list(early.index[:PRIMARY])
        groups[f"{name} 손으로 고른 8개"] = info["hand"]
        out[code] = {"name": name, "groups": groups, "top": top, "table": table, "n": len(inside), "n_early": int(early.sum()), "coverage": {k: float(table.cumulative.iloc[k - 1]) for k in SIZES}}
        tables.append(table.reset_index(names="surname").head(200).assign(country=code))
    path = OUT / "S27_other_sets.csv"
    pd.concat(tables).to_csv(path, index=False)
    dist.step("S27_other_sets", len(known), sum(len(t) for t in tables), path)
    return out


def membership(frame, code):
    """Label each first author with exactly one group; the country outranks China."""
    label = np.where(has(frame, "CN"), "china", "rest")
    return pd.Series(np.where(has(frame, code), "country", label), index=frame.index)


def cells(frame, names, code):
    """Counts per snapshot of (group, in set) for first authors with a known country."""
    known = frame[frame.known]
    table = pd.DataFrame({"snapshot": known.snapshot.values, "group": membership(known, code).values, "hit": known.surname.isin(names).values})
    return table.groupby(["snapshot", "group", "hit"]).size().unstack(fill_value=0).reindex(columns=[False, True], fill_value=0)


def decompose(counts):
    """Observed E, null E and shift-share from counts of shape (snapshot, group, miss/hit)."""
    per_group = counts.sum(axis=2, keepdims=True)
    pi = per_group[:, :, 0] / counts.sum(axis=(1, 2), keepdims=False)[:, None]
    held = counts[:, :, 1].sum(axis=0) / counts.sum(axis=(0, 2))
    share = counts[:, :, 1] / per_group[:, :, 0]
    observed = (pi * share).sum(axis=1)
    null = pi @ held
    pi_mean, share_mean = (pi[0] + pi[-1]) / 2, (share[0] + share[-1]) / 2
    return {"e_known": observed[-1] / observed[0], "e_null": null[-1] / null[0], "ratio": (observed[-1] / observed[0]) / (null[-1] / null[0]),
            "size": (pi[-1] - pi[0]) * share_mean, "within": pi_mean * (share[-1] - share[0]), "delta": observed[-1] - observed[0]}


def s28_overall(sets):
    snapshots = dist.clean(common.read_flags("S13_parsed_snapshots.csv"), "others_snapshots")
    exact = pd.read_csv(OUT / "S1b_exact_series.csv").set_index("year")
    first, last = int(snapshots.snapshot.min()), int(snapshots.snapshot.max())
    growth_all = float(exact.core_all[last] / exact.core_all[first])
    a, b = snapshots[snapshots.snapshot == first], snapshots[snapshots.snapshot == last]
    years = sorted(snapshots.snapshot.unique())
    order = ["country", "china", "rest"]
    rng = np.random.default_rng(SEED)
    result = {"first": first, "last": last, "growth_all": growth_all, "countries": {}}
    rows = []
    for code, info in sets.items():
        known_a, known_b = a[a.known], b[b.known]
        split = lambda frame, inside: frame[has(frame, code) == inside]
        series = []
        for year, group in snapshots.groupby("snapshot"):
            k = group[group.known]
            row = {"year": int(year), "pi": float(has(k, code).mean()), "n_country": int(has(k, code).sum())}
            for label, names in info["groups"].items():
                row[label] = float(group.surname.isin(names).mean())
            names = info["top"][PRIMARY]
            for tag, sub in [("inside", split(k, True)), ("outside", split(k, False))]:
                row[tag] = float(sub.surname.isin(names).mean())
            series.append(row)
        for label, names in info["groups"].items():
            h1, h2 = int(a.surname.isin(names).sum()), int(b.surname.isin(names).sum())
            e, lo, hi = common.ratio(h1, len(a), h2, len(b))
            in_a, in_b, out_a, out_b = split(known_a, True), split(known_b, True), split(known_a, False), split(known_b, False)
            i1, i2 = int(in_a.surname.isin(names).sum()), int(in_b.surname.isin(names).sum())
            o1, o2 = int(out_a.surname.isin(names).sum()), int(out_b.surname.isin(names).sum())
            ie, ilo, ihi = common.ratio(i1, len(in_a), i2, len(in_b))
            oe, olo, ohi = common.ratio(o1, len(out_a), o2, len(out_b))
            table = cells(snapshots, names, code)
            counts = np.array([[table.loc[(y, g)].values if (y, g) in table.index else [0, 0] for g in order] for y in years], dtype=float)
            point = decompose(counts)
            boot = []
            for _ in range(N_BOOT):
                draw = np.stack([rng.multinomial(int(c.sum()), c.ravel() / c.sum()).reshape(c.shape) for c in counts]).astype(float)
                with np.errstate(divide="ignore", invalid="ignore"):
                    boot.append(decompose(draw + 0.25)["ratio"])
            boot = np.array(boot)
            rows.append({"country": code, "group": label, "size": len(names), "share_first": h1 / len(a), "share_last": h2 / len(b), "hits_first": h1, "hits_last": h2,
                         "e": e, "lo": lo, "hi": hi, "growth": e * growth_all, "annual": e ** (1 / (last - first)) - 1,
                         "n_in_first": len(in_a), "n_in_last": len(in_b), "in_first": i1 / len(in_a), "in_last": i2 / len(in_b), "in_hits_first": i1, "in_hits_last": i2, "in_e": ie, "in_lo": ilo, "in_hi": ihi,
                         "out_first": o1 / len(out_a), "out_last": o2 / len(out_b), "out_hits_first": o1, "out_hits_last": o2, "out_e": oe, "out_lo": olo, "out_hi": ohi,
                         "e_known": float(point["e_known"]), "e_null": float(point["e_null"]), "ratio": float(point["ratio"]),
                         "ratio_lo": float(np.percentile(boot, 2.5)), "ratio_hi": float(np.percentile(boot, 97.5)), "delta": float(point["delta"]),
                         **{f"size_{g}": float(v) for g, v in zip(order, point["size"])}, **{f"within_{g}": float(v) for g, v in zip(order, point["within"])}})
        result["countries"][code] = {"series": series}
    frame = pd.DataFrame(rows)
    for code in sets:
        result["countries"][code]["rows"] = frame[frame.country == code].to_dict("records")
    path = OUT / "S28_other_growth.csv"
    frame.to_csv(path, index=False)
    dist.step("S28_other_growth", len(snapshots), len(frame), path)
    return result


def s29_fields(sets):
    frame = fields.load()
    _, exact = fields.exact_series()
    all_rows, summary = [], {}
    for code, info in sets.items():
        marked = frame.assign(hit=frame.surname.isin(info["top"][PRIMARY]), inside=has(frame, code))
        counts = marked.groupby(["level", "key", "name", "period"], as_index=False).agg(n=("work_id", "size"), hits=("hit", "sum"), known=("known", "sum"), inside=("inside", "sum"))
        cell = exact.merge(counts, on=["level", "key", "name", "period"])
        rows = []
        for (level, name), group in cell.groupby(["level", "name"]):
            group = group.set_index("period")
            p, q = group.loc[fields.EARLY], group.loc[fields.LATE]
            value, variance = fields.log_ratio(p.hits, p.n, q.hits, q.n)
            log_or, var_or = common.log_odds_ratio(p.hits, p.n, q.hits, q.n)
            rows.append({"country": code, "level": level, "name": name, "growth_all": float(q.per_year / p.per_year), "share_early": float(p.hits / p.n), "share_late": float(q.hits / q.n),
                         "hits_early": int(p.hits), "hits_late": int(q.hits), "n_early": int(p.n), "n_late": int(q.n), "log_e": float(value), "var": float(variance), "e": float(np.exp(value)),
                         "lo": float(np.exp(value - Z * np.sqrt(variance))), "hi": float(np.exp(value + Z * np.sqrt(variance))), "log_or": float(log_or), "var_or": float(var_or),
                         "pi_early": float(p.inside / p.known), "pi_late": float(q.inside / q.known), "thin": bool(p.hits < THIN)})
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
        q_or, i2_or, p_or = common.q_statistic(table.log_or, table.var_or)
        rho = stats.spearmanr(table.pi_late / table.pi_early.clip(lower=1e-3), table.e)
        ml = cell[cell.name.isin(fields.ML)].groupby("period").agg(hits=("hits", "sum"), n=("n", "sum"))
        value, variance = fields.log_ratio(ml.hits[fields.EARLY], ml.n[fields.EARLY], ml.hits[fields.LATE], ml.n[fields.LATE])
        summary[code] = {"Q": q, "df": df, "p": float(stats.chi2.sf(q, df)), "I2": max(0.0, (q - df) / q), "mean_e": float(np.exp(centre)), "mean_lo": float(np.exp(centre - Z * se)), "mean_hi": float(np.exp(centre + Z * se)),
                         "above": int((table.lo > 1).sum()), "below": int((table.hi < 1).sum()), "n": len(table), "thin": int(table.thin.sum()), "i2_or": i2_or, "p_or": p_or, "or_median": float(np.exp(table.log_or.median())),
                         "pi_rho": float(rho.statistic), "pi_p": float(rho.pvalue),
                         "ml": {"e": float(np.exp(value)), "lo": float(np.exp(value - Z * np.sqrt(variance))), "hi": float(np.exp(value + Z * np.sqrt(variance))), "share_early": float(ml.hits[fields.EARLY] / ml.n[fields.EARLY]), "share_late": float(ml.hits[fields.LATE] / ml.n[fields.LATE]), "hits_early": int(ml.hits[fields.EARLY])}}
        all_rows.append(growth)
    growth = pd.concat(all_rows)
    path = OUT / "S29_other_fields.csv"
    growth.to_csv(path, index=False)
    dist.step("S29_other_fields", len(frame), len(growth), path)
    return growth, summary


def s30_surnames(sets):
    snapshots = dist.clean(common.read_flags("S13_parsed_snapshots.csv"), "others_surnames")
    a, b = snapshots[snapshots.snapshot == snapshots.snapshot.min()], snapshots[snapshots.snapshot == snapshots.snapshot.max()]
    rows = []
    for code, info in sets.items():
        table = info["table"]
        for surname in info["top"][PRIMARY]:
            h1, h2 = int((a.surname == surname).sum()), int((b.surname == surname).sum())
            e, lo, hi = common.ratio(h1, len(a), h2, len(b))
            rows.append({"country": code, "surname": surname, "rank": int(table.loc[surname, "rank"]), "specificity": float(table.specificity[surname]), "hits_first": h1, "hits_last": h2, "e": e, "lo": lo, "hi": hi})
    frame = pd.DataFrame(rows)
    path = OUT / "S30_other_surnames.csv"
    frame.to_csv(path, index=False)
    dist.step("S30_other_surnames", len(snapshots), len(frame), path)
    return frame


def main():
    sets = s27_sets()
    for code, info in sets.items():
        print(code, info["n"], info["n_early"], info["coverage"], info["top"][PRIMARY], sep="\n")
    overall = s28_overall(sets)
    for code in sets:
        print(pd.DataFrame(overall["countries"][code]["rows"]).drop(columns="country").round(3).T.to_string())
        print(pd.DataFrame(overall["countries"][code]["series"]).iloc[:, :2].round(4).T.to_string())
    growth, summary = s29_fields(sets)
    print(growth[growth.level == "field"].sort_values(["country", "e"], ascending=False)[["country", "name", "hits_early", "hits_late", "e", "lo", "hi", "pi_early", "pi_late"]].round(3).to_string())
    print(json.dumps(summary, indent=0))
    surnames = s30_surnames(sets)
    print(surnames.round(2).to_string())
    data = {"primary": PRIMARY, "thin": THIN, "first": overall["first"], "last": overall["last"], "growth_all": overall["growth_all"],
            "countries": {code: {"name": info["name"], "n": info["n"], "n_early": info["n_early"], "coverage": info["coverage"], "top": info["top"][PRIMARY], "hand": COUNTRIES[code]["hand"],
                                 "rows": overall["countries"][code]["rows"], "series": overall["countries"][code]["series"], "fields": growth[(growth.country == code) & (growth.level == "field")].to_dict("records"),
                                 "summary": summary[code], "surnames": surnames[surnames.country == code].to_dict("records")} for code, info in sets.items()}}
    path = PAGE / "others.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float, allow_nan=False))
    dist.step("S31_others_page", len(growth), len(growth), path)


if __name__ == "__main__":
    main()
