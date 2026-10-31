"""How much faster did common Chinese surnames grow than papers overall, by field?

Excess growth E = (growth of surname papers) / (growth of all papers) = s_late / s_early.
E = 1 means the surname group only kept pace with the field.

S17: parse the field x period sample.
S18: growth and excess growth by field and subfield, with heterogeneity and FDR.
S19: statistical physics: scaling exponent across fields, Y2 collapse.
S20: data science: composition null per field, leave-one-field-out prediction,
     permutation test, trajectory clusters against a common-trajectory null.
S21: surname-level growth from the self-weighted snapshots.
S22: write docs/surname-share/fields.json for the page.

The composition null uses within-group surname shares frozen on the pooled core sample,
so nothing in it is fitted to the field cells. Its noise is shared with the field share
because both come from the same records; the exact-count China share (S1c) is the check.

Usage: python scripts/surname_share_fields.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats
from scipy.cluster.hierarchy import fcluster, linkage
from scipy.spatial.distance import pdist, squareform

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_analyze as analyze  # noqa: E402
import surname_share_distribution as dist  # noqa: E402

OUT = dist.OUT
PAGE = dist.PAGE
PERIODS = dist.PERIODS
YEARS = {"2000-2004": 5, "2005-2009": 5, "2010-2014": 5, "2015-2019": 5, "2020-2025": 6}
EARLY, LATE = PERIODS[0], PERIODS[-1]
FIVE = analyze.TARGETS
SIX = FIVE + ["Li"]
ML = ["Artificial Intelligence", "Computer Vision and Pattern Recognition"]
SEED = 20261102
N_BOOT = 4000
N_PERM = 20000
N_HALF = 200
N_CLUSTER = 300
Z = dist.Z


def load():
    frame = pd.read_csv(OUT / "S2e_field_sample.csv", keep_default_na=False, dtype={"work_id": str, "key": str})
    n_in = len(frame)
    parsed = [analyze.parse_surname(r, d, c.split("|")) for r, d, c in zip(frame.raw_name, frame.display_name, frame.countries)]
    frame["surname"] = [p[0] for p in parsed]
    frame["rule"] = [p[1] for p in parsed]
    frame["china"] = frame.countries.str.split("|").map(lambda c: "CN" in c)
    frame["known"] = frame.countries != ""
    path = OUT / "S17_field_parsed.csv"
    frame.to_csv(path, index=False)
    dist.step("S17_field_parse", n_in, len(frame), path)
    frame = dist.clean(frame, "fields")
    frame["w"] = frame.n_stratum / frame.groupby(["level", "key", "period"]).work_id.transform("size")
    return frame


def exact_series():
    series = pd.read_csv(OUT / "S1c_field_series.csv", dtype={"key": str})
    series["period"] = series.year.map(lambda y: PERIODS[min((y - 2000) // 5, 4)])
    cells = series.groupby(["level", "key", "name", "period"], as_index=False)[["n_articles", "n_china"]].sum()
    cells["per_year"] = cells.n_articles / cells.period.map(YEARS)
    cells["pi_exact"] = cells.n_china / cells.n_articles
    return series, cells


def log_ratio(h_early, n_early, h_late, n_late):
    """Log ratio of proportions with a Haldane correction, so empty cells stay finite."""
    h1, h2 = h_early + 0.5, h_late + 0.5
    n1, n2 = n_early + 1, n_late + 1
    value = np.log((h2 / n2) / (h1 / n1))
    variance = 1 / h1 - 1 / n1 + 1 / h2 - 1 / n2
    return value, variance


def s18_growth(frame, cells):
    frame = frame.assign(five=frame.surname.isin(FIVE), six=frame.surname.isin(SIX))
    counts = frame.groupby(["level", "key", "name", "period"], as_index=False).agg(
        n=("work_id", "size"), hits=("five", "sum"), hits_six=("six", "sum"),
        known=("known", "sum"), china_first=("china", "sum"))
    for surname in FIVE:
        part = frame[frame.surname == surname].groupby(["level", "key", "period"]).size().rename(surname).reset_index()
        counts = counts.merge(part, on=["level", "key", "period"], how="left")
        counts[surname] = counts[surname].fillna(0).astype(int)
    cell = cells.merge(counts, on=["level", "key", "name", "period"], how="left")
    cell["share"] = cell.hits / cell.n
    cell["papers_per_year"] = cell.share * cell.per_year

    rows = []
    for (level, key, name), group in cell.groupby(["level", "key", "name"]):
        group = group.set_index("period")
        a, b = group.loc[EARLY], group.loc[LATE]
        value, variance = log_ratio(a.hits, a.n, b.hits, b.n)
        six_value, _ = log_ratio(a.hits_six, a.n, b.hits_six, b.n)
        rows.append({
            "level": level, "key": key, "name": name, "domain": None,
            "growth_all": float(b.per_year / a.per_year), "share_early": float(a.share), "share_late": float(b.share),
            "growth_five": float((b.share * b.per_year) / max(a.share * a.per_year, 1e-12)),
            "log_e": float(value), "var": float(variance), "e": float(np.exp(value)),
            "e_lo": float(np.exp(value - Z * np.sqrt(variance))), "e_hi": float(np.exp(value + Z * np.sqrt(variance))),
            "e_six": float(np.exp(six_value)), "hits_early": int(a.hits), "hits_late": int(b.hits),
            "n_early": int(a.n), "n_late": int(b.n), "pi_early": float(a.pi_exact), "pi_late": float(b.pi_exact),
            "p": float(2 * stats.norm.sf(abs(value) / np.sqrt(variance))),
        })
    growth = pd.DataFrame(rows)

    # Benjamini-Hochberg over the 26 fields only: subfields overlap Computer Science.
    fields = growth[growth.level == "field"].sort_values("p")
    m = len(fields)
    adjusted = (fields.p * m / np.arange(1, m + 1))[::-1].cummin()[::-1].clip(upper=1)
    growth["q"] = adjusted.reindex(growth.index)

    fields = growth[growth.level == "field"]
    weights = 1 / fields["var"]
    mean = (weights * fields.log_e).sum() / weights.sum()
    q = (weights * (fields.log_e - mean) ** 2).sum()
    df = len(fields) - 1
    tau2 = max(0.0, (q - df) / (weights.sum() - (weights ** 2).sum() / weights.sum()))
    random_weights = 1 / (fields["var"] + tau2)
    random_mean = (random_weights * fields.log_e).sum() / random_weights.sum()
    random_se = np.sqrt(1 / random_weights.sum())
    heterogeneity = {
        "Q": float(q), "df": df, "p": float(stats.chi2.sf(q, df)), "I2": float(max(0.0, (q - df) / q)), "tau2": float(tau2),
        "tau": float(np.sqrt(tau2)), "mean_e": float(np.exp(random_mean)), "mean_e_lo": float(np.exp(random_mean - Z * random_se)),
        "mean_e_hi": float(np.exp(random_mean + Z * random_se)),
        "predict_lo": float(np.exp(random_mean - Z * np.sqrt(random_se ** 2 + tau2))),
        "predict_hi": float(np.exp(random_mean + Z * np.sqrt(random_se ** 2 + tau2))),
    }

    # Empirical Bayes: noisy small fields shrink towards the across-field mean.
    shrink = tau2 / (tau2 + growth["var"])
    growth["e_shrunk"] = np.exp(random_mean + shrink * (growth.log_e - random_mean))
    posterior = np.sqrt(shrink * growth["var"])
    growth["e_shrunk_lo"] = np.exp(random_mean + shrink * (growth.log_e - random_mean) - Z * posterior)
    growth["e_shrunk_hi"] = np.exp(random_mean + shrink * (growth.log_e - random_mean) + Z * posterior)

    ml = cell[cell.name.isin(ML)]
    pooled = ml.assign(mass=ml.share * ml.per_year).groupby("period").agg(mass=("mass", "sum"), per_year=("per_year", "sum"), hits=("hits", "sum"), n=("n", "sum"))
    share = pooled.mass / pooled.per_year
    value, variance = log_ratio(pooled.hits[EARLY], pooled.n[EARLY], pooled.hits[LATE], pooled.n[LATE])
    ml_row = {"growth_all": float(pooled.per_year[LATE] / pooled.per_year[EARLY]), "share_early": float(share[EARLY]), "share_late": float(share[LATE]),
              "e": float(share[LATE] / share[EARLY]), "e_lo": float(np.exp(np.log(share[LATE] / share[EARLY]) - Z * np.sqrt(variance))),
              "e_hi": float(np.exp(np.log(share[LATE] / share[EARLY]) + Z * np.sqrt(variance))),
              "growth_five": float((pooled.mass[LATE]) / pooled.mass[EARLY]), "hits_early": int(pooled.hits[EARLY]), "hits_late": int(pooled.hits[LATE])}
    path = OUT / "S18_field_growth.csv"
    growth.to_csv(path, index=False)
    cell.to_csv(OUT / "S18_field_period.csv", index=False)
    dist.step("S18_field_growth", len(frame), len(growth), path)
    return cell, growth, heterogeneity, ml_row


def s19_physics(frame, cell, seed=SEED):
    rng = np.random.default_rng(seed)
    fields = cell[cell.level == "field"].copy()
    fields["log_n"] = np.log(fields.per_year)
    fields["log_f"] = np.log(fields.share.clip(lower=0.5 / fields.n) * fields.per_year)

    def within_slope(table):
        x = table.log_n - table.groupby("key").log_n.transform("mean")
        y = table.log_f - table.groupby("key").log_f.transform("mean")
        return float((x * y).sum() / (x ** 2).sum())

    beta = within_slope(fields)
    keys = fields.key.unique()
    samples = []
    tables = {k: g for k, g in fields.groupby("key")}
    for _ in range(N_BOOT):
        chosen = rng.choice(keys, len(keys))
        parts = [tables[k].assign(key=f"{i}") for i, k in enumerate(chosen)]
        samples.append(within_slope(pd.concat(parts)))
    scaling = {"beta": beta, "lo": float(np.percentile(samples, 2.5)), "hi": float(np.percentile(samples, 97.5))}
    between = fields[fields.period == LATE]
    slope = stats.linregress(between.log_n, between.log_f)
    scaling.update(between_beta=float(slope.slope), between_se=float(slope.stderr))

    old = json.loads((PAGE / "distribution.json").read_text())["mixture"]
    frozen = (old["y_china"], old["y_other"], old["y_cross"])
    field_rows = frame[frame.level == "field"]
    collapse = []
    for (key, name, period), group in field_rows.groupby(["key", "name", "period"]):
        known = group[group.known]
        china, other = known[known.china], known[~known.china]
        if len(known) < 100:
            continue
        pi = float(len(china) / len(known))
        same = known.surname.value_counts().values.astype(float)
        y2 = float((same * (same - 1)).sum() / (len(known) * (len(known) - 1)))
        half = []
        names = known.surname.values
        for _ in range(N_HALF):
            part = pd.Series(rng.permutation(names)[: len(names) // 2]).value_counts().values.astype(float)
            half.append((part * (part - 1)).sum() / (part.sum() * (part.sum() - 1)))
        se = float(dist.half_sample_se(y2, pd.Series(half)))
        predicted = float(dist.mixture(pi, *frozen))
        collapse.append({"key": key, "name": name, "period": period, "pi": pi, "y2": y2, "se": se, "predicted": predicted, "n": int(len(known)),
                         "inside": bool(abs(y2 - predicted) <= Z * se)})
    collapse = pd.DataFrame(collapse)
    positive = collapse[collapse.y2 > 0]
    r2 = 1 - ((collapse.y2 - collapse.predicted) ** 2).sum() / ((collapse.y2 - collapse.y2.mean()) ** 2).sum()
    physics = {"r2": float(r2), "spearman": float(stats.spearmanr(collapse.y2, collapse.predicted)[0]), "n_cells": int(len(collapse)),
               "n_positive": int(len(positive)), "mean_ratio": float(collapse.y2.sum() / collapse.predicted.sum()), "inside": int(collapse.inside.sum())}
    path = OUT / "S19_collapse.csv"
    collapse.to_csv(path, index=False)
    dist.step("S19_physics", len(fields), len(collapse), path)
    return scaling, physics, collapse


def within_shares():
    """Five-surname share among China and other first authors, pooled core 2000-2025."""
    pooled = pd.read_csv(OUT / "S13_parsed_pooled.csv", keep_default_na=False, dtype={"work_id": str})
    pooled = dist.clean(pooled, "fields_within")
    known = pooled[pooled.known.astype(str) == "True"]
    china = known.china.astype(str) == "True"
    five = known.surname.isin(FIVE)
    return float(five[china].mean()), float(five[~china].mean()), int(china.sum()), int((~china).sum())


def silhouette(profile, labels):
    distances = squareform(pdist(profile))
    a = np.array([distances[i, labels == labels[i]].sum() / max((labels == labels[i]).sum() - 1, 1) for i in range(len(labels))])
    b = np.array([min(distances[i, labels == c].mean() for c in set(labels) if c != labels[i]) for i in range(len(labels))])
    return float(np.mean((b - a) / np.maximum(a, b)))


def best_clusters(shares):
    logged = np.log(np.clip(shares, 0.002, None))
    profile = logged - logged.mean(axis=1, keepdims=True)
    linked = linkage(profile, method="ward")
    scored = [(silhouette(profile, fcluster(linked, k, criterion="maxclust")), k) for k in (2, 3, 4)]
    score, k = max(scored)
    return score, k, fcluster(linked, k, criterion="maxclust")


def s20_data_science(growth, cell, seed=SEED + 1):
    rng = np.random.default_rng(seed)
    fields = growth[growth.level == "field"].reset_index(drop=True)
    s_china, s_other, n_china, n_other = within_shares()
    mean_share = lambda pi: pi * s_china + (1 - pi) * s_other
    first = cell[cell.level == "field"].assign(pi_first=lambda t: t.china_first / t.known).set_index(["name", "period"]).pi_first
    fields["e_null"] = [mean_share(first[n, LATE]) / mean_share(first[n, EARLY]) for n in fields.name]
    fields["e_null_exact"] = mean_share(fields.pi_late) / mean_share(fields.pi_early)
    z = (fields.log_e - np.log(fields.e_null)) / np.sqrt(fields["var"])
    residual = float(1 - (((fields.log_e - np.log(fields.e_null)) ** 2) / fields["var"]).sum() / (((fields.log_e - np.average(fields.log_e, weights=1 / fields["var"])) ** 2) / fields["var"]).sum())
    composition = {"s_china": s_china, "s_other": s_other, "n_china": n_china, "n_other": n_other, "inside": int((z.abs() <= Z).sum()), "n_fields": int(len(fields)),
                   "r2": residual, "ratio_median": float(np.median(fields.e / fields.e_null)), "ratio_exact_median": float(np.median(fields.e / fields.e_null_exact)),
                   "chi2_p": float(stats.chi2.sf((z ** 2).sum(), len(fields))),
                   "rows": [{"name": n, "e": float(e), "e_null": float(a), "e_null_exact": float(b)} for n, e, a, b in zip(fields.name, fields.e, fields.e_null, fields.e_null_exact)]}
    spearman = stats.spearmanr(np.log(fields.growth_all), fields.log_e)
    x = (np.log(fields.pi_late / (1 - fields.pi_late)) - np.log(fields.pi_early / (1 - fields.pi_early))).values
    y = fields.log_e.values
    w = 1 / (fields["var"].values + 0.0)

    def wls(xv, yv, weights):
        design = np.column_stack([np.ones_like(xv), xv])
        return np.linalg.solve(design.T @ (design * weights[:, None]), design.T @ (yv * weights))

    beta = wls(x, y, w)
    predictions = np.array([np.polyval(wls(np.delete(x, i), np.delete(y, i), np.delete(w, i))[::-1], x[i]) for i in range(len(x))])
    baseline = np.array([np.average(np.delete(y, i), weights=np.delete(w, i)) for i in range(len(x))])
    r2_cv = 1 - (w * (y - predictions) ** 2).sum() / (w * (y - baseline) ** 2).sum()
    r_observed = np.cov(x, y, aweights=w)[0, 1] / np.sqrt(np.cov(x, aweights=w) * np.cov(y, aweights=w))
    permuted = []
    for _ in range(N_PERM):
        z = rng.permutation(x)
        permuted.append(np.cov(z, y, aweights=w)[0, 1] / np.sqrt(np.cov(z, aweights=w) * np.cov(y, aweights=w)))
    p_perm = float((np.sum(np.abs(permuted) >= abs(r_observed)) + 1) / (N_PERM + 1))

    table = cell[cell.level == "field"]
    wide = table.pivot(index="name", columns="period", values="share")[PERIODS]
    sizes = table.pivot(index="name", columns="period", values="n")[PERIODS]
    score, k, labels = best_clusters(wide.values)
    common = (wide.values / wide.values.mean(axis=1, keepdims=True)).mean(axis=0)
    expected = np.clip(wide.values.mean(axis=1, keepdims=True) * common, 0, 1)
    null = [best_clusters(rng.binomial(sizes.values.astype(int), expected) / sizes.values)[0] for _ in range(N_CLUSTER)]
    cluster_p = float((np.sum(np.array(null) >= score) + 1) / (N_CLUSTER + 1))
    clusters = pd.DataFrame({"name": wide.index, "cluster": labels})
    summary = wide.assign(cluster=labels).groupby("cluster").mean()
    order = summary[LATE].sort_values(ascending=False).index
    rank = {c: i + 1 for i, c in enumerate(order)}
    clusters["cluster"] = clusters.cluster.map(rank)
    path = OUT / "S20_clusters.csv"
    clusters.to_csv(path, index=False)
    dist.step("S20_data_science", len(fields), len(clusters), path)
    return ({"slope": float(beta[1]), "intercept": float(beta[0]), "r_weighted": float(r_observed), "p_perm": p_perm, "r2_cv": float(r2_cv),
             "growth_rho": float(spearman.statistic), "growth_p": float(spearman.pvalue), "composition": composition,
             "points": [{"name": n, "x": float(a), "y": float(b), "e": float(np.exp(b))} for n, a, b in zip(fields.name, x, y)]},
            {"k": int(k), "silhouette": score, "null_p": cluster_p, "null_median": float(np.median(null)), "members": clusters.to_dict("records"),
             "profiles": {rank[c]: summary.loc[c, PERIODS].astype(float).tolist() for c in order}})


def s21_surnames():
    frame = pd.read_csv(OUT / "S13_parsed_snapshots.csv", keep_default_na=False, dtype={"work_id": str})
    exact = pd.read_csv(OUT / "S1b_exact_series.csv").set_index("year")
    first, last = int(frame.snapshot.min()), int(frame.snapshot.max())
    growth_all = float(exact.core_all[last] / exact.core_all[first])
    a, b = frame[frame.snapshot == first], frame[frame.snapshot == last]
    rows = []
    for label, names in [(s, [s]) for s in FIVE] + [("All five", FIVE), ("Li", ["Li"])]:
        h1, h2 = int(a.surname.isin(names).sum()), int(b.surname.isin(names).sum())
        value, variance = log_ratio(h1, len(a), h2, len(b))
        rows.append({"surname": label, "share_first": h1 / len(a), "share_last": h2 / len(b), "hits_first": h1, "hits_last": h2,
                     "e": float(np.exp(value)), "e_lo": float(np.exp(value - Z * np.sqrt(variance))), "e_hi": float(np.exp(value + Z * np.sqrt(variance))),
                     "growth": float(np.exp(value) * growth_all)})
    series = []
    for year, group in frame.groupby("snapshot"):
        row = {"year": int(year), "n": int(len(group)), "n_core": int(exact.core_all[year]), "index_all": float(exact.core_all[year] / exact.core_all[first])}
        for label, names in [(s, [s]) for s in FIVE] + [("All five", FIVE)]:
            row[label] = float(group.surname.isin(names).mean())
        series.append(row)
    path = OUT / "S21_surname_growth.csv"
    pd.DataFrame(rows).to_csv(path, index=False)
    dist.step("S21_surname_growth", len(frame), len(rows), path)
    return {"first": first, "last": last, "growth_all": growth_all, "rows": rows, "series": series}


def main():
    frame = load()
    series, cells = exact_series()
    print("records", len(frame), flush=True)
    cell, growth, heterogeneity, ml = s18_growth(frame, cells)
    shown = growth.sort_values("e", ascending=False)[["level", "name", "growth_all", "share_early", "share_late", "e", "e_lo", "e_hi", "e_shrunk", "hits_early", "hits_late", "q"]]
    print(shown.round(3).to_string(), heterogeneity, ml, sep="\n", flush=True)
    scaling, physics, collapse = s19_physics(frame, cell)
    print(scaling, physics, flush=True)
    prediction, clusters = s20_data_science(growth, cell)
    print({k: v for k, v in prediction.items() if k not in ("points", "composition")}, {k: v for k, v in clusters.items() if k != "members"}, flush=True)
    print({k: v for k, v in prediction["composition"].items() if k != "rows"}, pd.DataFrame(prediction["composition"]["rows"]).round(2).to_string(), sep="\n", flush=True)
    print(pd.DataFrame(clusters["members"]).sort_values("cluster").to_string(), flush=True)
    surnames = s21_surnames()
    print(pd.DataFrame(surnames["rows"]).round(3).to_string(), surnames["growth_all"], flush=True)
    growth = growth.drop(columns="domain").astype(object)
    growth = growth.where(growth.notna(), None)
    data = {"periods": PERIODS, "cells": cell.to_dict("records"), "growth": growth.to_dict("records"),
            "heterogeneity": heterogeneity, "ml": ml, "scaling": scaling, "physics": physics, "collapse": collapse.to_dict("records"),
            "prediction": prediction, "clusters": clusters, "surnames": surnames, "n_records": int(len(frame))}
    path = PAGE / "fields.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float, allow_nan=False))
    dist.step("S22_page_data", len(cell), len(cell), path)


if __name__ == "__main__":
    main()
