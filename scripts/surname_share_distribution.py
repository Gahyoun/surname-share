"""Distributional analysis of first-author surname frequencies.

Reads the parsed samples written by surname_share_analyze.py.

S7:  frequency tables (equal-probability subsamples; dropped rows saved with a reason).
S8:  synthetic validation of the power-law pipeline at the empirical sample size.
S9:  tail fits: discrete power law (Clauset et al.), goodness of fit, Vuong LR tests.
S10: surname concentration over time: inverse participation ratio, Hill numbers,
     and the two-population mixture null.
S11: write docs/distribution.json for the page.

Usage: python scripts/surname_share_distribution.py [--quick]
"""
import csv
import hashlib
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import optimize, special, stats

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
PAGE = ROOT / "docs"

QUICK = "--quick" in sys.argv
N_GOF = 40 if QUICK else 300
N_SYNTH = 8 if QUICK else 100
N_SYNTH_GOF = 19 if QUICK else 99
N_REPLICATES = 5 if QUICK else 50
N_BOOT = 50 if QUICK else 1000
MIN_TAIL = 50
KMIN_FLOOR = 5  # below this, binomial thinning from the population shapes the counts
SEED = 20261031
Z = 1.959964

NON_NAMES = {
    "University", "Group", "Committee", "Consortium", "Collaboration", "Team", "Investigators", "Editors",
    "Editor", "Staff", "Society", "Association", "Board", "Study", "Network", "Center", "Centre", "Institute",
    "Jr", "Sr", "Ii", "Iii", "Iv", "Al", "Na", "Anonymous",
}
PERIODS = ["2000-2004", "2005-2009", "2010-2014", "2015-2019", "2020-2025"]


def step(name, n_in, n_out, path):
    digest = hashlib.sha256(Path(path).read_bytes()).hexdigest()
    with open(OUT / "STEP_LOG.csv", "a", newline="", encoding="utf-8") as f:
        csv.writer(f).writerow([name, n_in, n_out, n_in - n_out, Path(path).name, digest])


# --- S7: frequency tables -------------------------------------------------

def clean(df, label):
    """Keep Latin-script surnames; save every dropped row with its reason."""
    reason = pd.Series("", index=df.index)
    latin = df.surname.str.fullmatch(r"[A-Za-z][A-Za-z'\-]+")
    reason[~latin] = "not_latin_or_too_short"
    reason[df.surname.isin(NON_NAMES)] = "not_a_personal_name"
    dropped = df[reason != ""].assign(reason=reason[reason != ""])
    dropped.to_csv(OUT / f"S7_clean_{label}__dropped.csv", index=False)
    kept = df[reason == ""].copy()
    path = OUT / f"S7_clean_{label}.csv"
    kept.to_csv(path, index=False)
    step(f"S7_clean_{label}", len(df), len(kept), path)
    return kept


def load():
    core = pd.read_csv(OUT / "S3_parsed_core.csv", keep_default_na=False, dtype={"work_id": str})
    exact = pd.read_csv(OUT / "S1b_exact_series.csv").set_index("year")
    core["n_h"] = core.groupby("year").work_id.transform("size")
    core["w"] = core.year.map(exact.core_all) / core.n_h
    core["stratum"] = core.year.astype(str)

    full = pd.read_csv(OUT / "S3_parsed_all.csv", keep_default_na=False, dtype={"work_id": str})
    strata = pd.read_csv(OUT / "S1_strata.csv")
    strata["stratum"] = strata.period + "|" + strata.field_id.astype(str)
    full["stratum"] = full.period + "|" + full.field_id.astype(str)
    full["n_h"] = full.groupby("stratum").work_id.transform("size")
    full["w"] = full.stratum.map(strata.set_index("stratum").n_articles) / full.n_h

    core = clean(core, "core")
    full = clean(full, "all")
    for df in (core, full):
        df["china"] = df.countries.str.split("|").map(lambda c: "CN" in c)
        df["known"] = df.countries != ""
    return core, full


def equal_probability(df, rng):
    """Rejection step: every article in the population gets the same inclusion probability."""
    keep = rng.random(len(df)) < df.w.values / df.w.values.max()
    return df[keep]


def frequencies(df):
    return df.surname.value_counts().values.astype(np.int64)


# --- S8/S9: discrete power-law machinery ---------------------------------

def fit_alpha(k_tail, kmin):
    mean_log = np.log(k_tail).mean()

    def nll(a):
        return np.log(special.zeta(a, kmin)) + a * mean_log

    result = optimize.minimize_scalar(nll, bounds=(1.01, 8.0), method="bounded", options={"xatol": 1e-3})
    return float(result.x)


def ks_distance(k_tail, kmin, alpha):
    values, counts = np.unique(k_tail, return_counts=True)
    empirical = np.cumsum(counts) / counts.sum()
    model = 1 - special.zeta(alpha, values + 1) / special.zeta(alpha, kmin)
    return float(np.abs(empirical - model).max())


def candidate_kmins(k):
    values = np.unique(k)
    usable = [v for v in values if v >= KMIN_FLOOR and (k >= v).sum() >= MIN_TAIL]
    if len(usable) > 24:
        usable = [usable[i] for i in np.unique(np.geomspace(1, len(usable), 24).astype(int) - 1)]
    return usable


def fit_power_law(k):
    best = None
    for kmin in candidate_kmins(k):
        tail = k[k >= kmin]
        alpha = fit_alpha(tail, kmin)
        distance = ks_distance(tail, kmin, alpha)
        if best is None or distance < best["ks"]:
            best = {"kmin": int(kmin), "alpha": alpha, "ks": distance, "n_tail": int(len(tail))}
    return best


def sample_power_law(rng, size, alpha, kmin):
    u = rng.random(size)
    return np.floor((kmin - 0.5) * (1 - u) ** (-1 / (alpha - 1)) + 0.5).astype(np.int64).clip(max=10 ** 9)


def gof_pvalue(k, fit, reps, rng):
    """Clauset et al. semi-parametric bootstrap, refitting kmin in every replicate."""
    body = k[k < fit["kmin"]]
    p_tail = fit["n_tail"] / len(k)
    exceed = 0
    for _ in range(reps):
        n_tail = rng.binomial(len(k), p_tail)
        synthetic = sample_power_law(rng, n_tail, fit["alpha"], fit["kmin"])
        if len(body):
            synthetic = np.concatenate([synthetic, rng.choice(body, len(k) - n_tail)])
        refit = fit_power_law(synthetic)
        if refit is not None and refit["ks"] >= fit["ks"]:
            exceed += 1
    return exceed / reps


def log_power_law(k, kmin, alpha):
    return -alpha * np.log(k) - np.log(special.zeta(alpha, kmin))


GRID = np.arange(1, 300001, dtype=float)


def log_cutoff(k, kmin, alpha, lam):
    grid = GRID[kmin - 1:]
    norm = np.sum(grid ** -alpha * np.exp(-lam * grid))
    return -alpha * np.log(k) - lam * k - np.log(norm)


def log_stretched(k, kmin, beta, lam):
    grid = GRID[kmin - 1:]
    norm = np.sum(grid ** (beta - 1) * np.exp(-lam * grid ** beta))
    return (beta - 1) * np.log(k) - lam * k ** beta - np.log(norm)


def log_lognormal(k, kmin, mu, sigma):
    upper = stats.norm.logsf((np.log(k - 0.5) - mu) / sigma)
    lower = stats.norm.logsf((np.log(k + 0.5) - mu) / sigma)
    mass = upper + np.log1p(-np.exp(np.minimum(lower - upper, -1e-12)))
    return mass - stats.norm.logsf((np.log(kmin - 0.5) - mu) / sigma)


def log_exponential(k, kmin, lam):
    return (k - kmin) * -lam + np.log1p(-np.exp(-lam))


def maximise(log_pdf, start):
    def nll(theta):
        try:
            value = -log_pdf(theta).sum()
        except (ValueError, FloatingPointError):
            return 1e300
        return value if np.isfinite(value) else 1e300

    result = optimize.minimize(nll, start, method="Nelder-Mead", options={"maxiter": 400, "xatol": 1e-3, "fatol": 1e-3})
    return result.x


def vuong(a, b):
    """Normalised log-likelihood ratio of a over b and its two-sided p value."""
    diff = a - b
    sd = diff.std()
    if sd == 0:
        return 0.0, 1.0
    statistic = diff.sum() / (np.sqrt(len(diff)) * sd)
    return float(statistic), float(2 * stats.norm.sf(abs(statistic)))


def compare_alternatives(k, fit):
    kmin, alpha = fit["kmin"], fit["alpha"]
    tail = k[k >= kmin].astype(float)
    power = log_power_law(tail, kmin, alpha)
    logs = np.log(tail)

    mu, sigma = maximise(lambda t: log_lognormal(tail, kmin, t[0], abs(t[1]) + 1e-6), [logs.mean(), max(logs.std(), 0.3)])
    lognormal = log_lognormal(tail, kmin, mu, abs(sigma) + 1e-6)
    lam_exp = maximise(lambda t: log_exponential(tail, kmin, abs(t[0]) + 1e-9), [1 / max(tail.mean() - kmin, 0.5)])[0]
    exponential = log_exponential(tail, kmin, abs(lam_exp) + 1e-9)
    beta, lam_str = maximise(lambda t: log_stretched(tail, kmin, np.clip(abs(t[0]), 0.02, 1.0), abs(t[1]) + 1e-9), [0.5, 1.0])
    stretched = log_stretched(tail, kmin, np.clip(abs(beta), 0.02, 1.0), abs(lam_str) + 1e-9)
    a_cut, lam_cut = maximise(lambda t: log_cutoff(tail, kmin, t[0], abs(t[1]) + 1e-7), [max(alpha - 0.2, 1.05), 1 / tail.max()])
    cutoff = log_cutoff(tail, kmin, a_cut, abs(lam_cut) + 1e-7)

    rows = {}
    for name, other in [("lognormal", lognormal), ("exponential", exponential), ("stretched", stretched)]:
        rows[name] = dict(zip(("R", "p"), vuong(power, other)))
    # Power law is nested in the cutoff model, so this LR is one-sided chi-square.
    lr = 2 * (cutoff.sum() - power.sum())
    rows["cutoff"] = {"lr": float(lr), "p": float(0.5 * stats.chi2.sf(max(lr, 0), 1)), "alpha": float(a_cut),
                      "lambda": float(abs(lam_cut) + 1e-7)}
    rows["lognormal_params"] = {"mu": float(mu), "sigma": float(abs(sigma))}
    return rows


# --- S8 synthetic validation ---------------------------------------------

def sample_counts(rng, probabilities, n):
    counts = rng.multinomial(n, probabilities)
    return counts[counts > 0].astype(np.int64)


def population(kind, rng, alpha, china, pi, y_other):
    if kind == "power":
        size = rng.pareto(alpha - 1, 60000) + 1
    elif kind == "lognormal":
        size = rng.lognormal(0, np.sqrt(np.log(y_other * 60000)), 60000)
    else:
        # Mixture null: measured Chinese surname frequencies plus a lognormal
        # population calibrated to the measured non-China collision probability.
        broad = rng.lognormal(0, np.sqrt(np.log(y_other * 60000)), 60000)
        size = np.concatenate([pi * china / china.sum(), (1 - pi) * broad / broad.sum()])
    return size / size.sum()


def synth_one(args):
    kind, n, alpha, china, pi, y_other, seed = args
    rng = np.random.default_rng(seed)
    k = sample_counts(rng, population(kind, rng, alpha, china, pi, y_other), n)
    fit = fit_power_law(k)
    if fit is None:
        return None
    p = gof_pvalue(k, fit, N_SYNTH_GOF, rng)
    tail = k[k >= fit["kmin"]].astype(float)
    logs = np.log(tail)
    mu, sigma_fit = maximise(lambda t: log_lognormal(tail, fit["kmin"], t[0], abs(t[1]) + 1e-6), [logs.mean(), max(logs.std(), 0.3)])
    cut_a, cut_l = maximise(lambda t: log_cutoff(tail, fit["kmin"], t[0], abs(t[1]) + 1e-7), [max(fit["alpha"] - 0.2, 1.05), 1 / tail.max()])
    cut_lr = 2 * (log_cutoff(tail, fit["kmin"], cut_a, abs(cut_l) + 1e-7).sum() - log_power_law(tail, fit["kmin"], fit["alpha"]).sum())
    r, r_p = vuong(log_power_law(tail, fit["kmin"], fit["alpha"]), log_lognormal(tail, fit["kmin"], mu, abs(sigma_fit) + 1e-6))
    return {"kind": kind, "alpha": fit["alpha"], "kmin": fit["kmin"], "n_tail": fit["n_tail"], "gof_p": p, "R": r, "R_p": r_p,
            "cutoff_p": float(0.5 * stats.chi2.sf(max(cut_lr, 0), 1))}


def s8_synthetic(n, alpha, china, pi, y_other):
    jobs = [(kind, n, alpha, china, pi, y_other, SEED + 10 * i + j)
            for j, kind in enumerate(["power", "lognormal", "mixture"]) for i in range(N_SYNTH)]
    with ProcessPoolExecutor() as pool:
        rows = [r for r in pool.map(synth_one, jobs) if r]
    frame = pd.DataFrame(rows)
    path = OUT / "S8_synthetic.csv"
    frame.to_csv(path, index=False)
    step("S8_synthetic", len(jobs), len(frame), path)
    summary = []
    for kind, group in frame.groupby("kind"):
        summary.append({"kind": kind, "reps": len(group), "alpha_median": float(group.alpha.median()),
                        "alpha_lo": float(group.alpha.quantile(0.025)), "alpha_hi": float(group.alpha.quantile(0.975)),
                        "kmin_median": float(group.kmin.median()), "n_tail_median": float(group.n_tail.median()),
                        "reject_gof": float((group.gof_p < 0.1).mean()),
                        "prefers_cutoff": float((group.cutoff_p < 0.1).mean()),
                        "prefers_lognormal": float(((group.R < 0) & (group.R_p < 0.1)).mean()),
                        "prefers_power": float(((group.R > 0) & (group.R_p < 0.1)).mean())})
    return summary


# --- S9 tail fits ---------------------------------------------------------

def tail_job(args):
    name, k, replicate_alphas, seed = args
    rng = np.random.default_rng(seed)
    fit = fit_power_law(k)
    summary = dict(name=name, n_authors=int(k.sum()), n_surnames=int(len(k)), singletons=int((k == 1).sum()),
                   k_max=int(k.max()), top5_share=float(np.sort(k)[-5:].sum() / k.sum()))
    if fit is None:
        return {**summary, "alpha": None, "alternatives": None}
    fit["gof_p"] = gof_pvalue(k, fit, N_GOF, rng)
    fit["alternatives"] = compare_alternatives(k, fit)
    tail = k[k >= fit["kmin"]]
    boot = []
    for _ in range(N_GOF):
        resample = rng.choice(k, len(k))
        refit = fit_power_law(resample)
        if refit:
            boot.append(refit["alpha"])
    fit.update(summary)
    fit.update(alpha_lo=float(np.percentile(boot, 2.5)), alpha_hi=float(np.percentile(boot, 97.5)),
               alpha_replicate_lo=float(np.percentile(replicate_alphas, 2.5)) if replicate_alphas else None,
               alpha_replicate_hi=float(np.percentile(replicate_alphas, 97.5)) if replicate_alphas else None,
               zipf_exponent=float(1 / (fit["alpha"] - 1)), tail_share=float(tail.sum() / k.sum()))
    return fit


def s9_tails(core, full):
    subsets = {
        "All OpenAlex": full,
        "Core 2000-2025": core[core.year >= 2000],
        "Core, China": core[(core.year >= 2000) & core.china],
        "Core, non-China": core[(core.year >= 2000) & core.known & ~core.china],
        "Core 2000-2004": core[core.year.between(2000, 2004)],
        "Core 2020-2025": core[core.year >= 2020],
    }
    jobs, tables = [], {}
    for i, (name, df) in enumerate(subsets.items()):
        rng = np.random.default_rng(SEED + i)
        k = frequencies(equal_probability(df, rng))
        alphas = []
        for _ in range(N_REPLICATES):
            refit = fit_power_law(frequencies(equal_probability(df, rng)))
            if refit:
                alphas.append(refit["alpha"])
        jobs.append((name, k, alphas, SEED + 100 + i))
        tables[name] = k
    with ProcessPoolExecutor() as pool:
        rows = list(pool.map(tail_job, jobs))
    flat = [{key: value for key, value in r.items() if key != "alternatives"} for r in rows]
    path = OUT / "S9_tail_fits.csv"
    pd.DataFrame(flat).to_csv(path, index=False)
    step("S9_tail_fits", len(jobs), len(rows), path)
    curves = {}
    for name, k in tables.items():
        values, counts = np.unique(k, return_counts=True)
        survival = counts[::-1].cumsum()[::-1] / counts.sum()
        rank = np.sort(k)[::-1]
        picks = np.unique(np.geomspace(1, len(rank), 120).astype(int) - 1)
        curves[name] = {"k": values.tolist(), "ccdf": survival.tolist(),
                        "rank": (picks + 1).tolist(), "freq": rank[picks].tolist()}
    return rows, curves


# --- S10 concentration over time -----------------------------------------

def collision(df):
    """Unbiased weighted probability that two distinct articles share a first-author surname."""
    w = df.w.values
    by_name = df.groupby("surname").w.sum().values
    total = w.sum()
    return float((np.sum(by_name ** 2) - np.sum(w ** 2)) / (total ** 2 - np.sum(w ** 2)))


def overlap(a, b):
    p = a.groupby("surname").w.sum() / a.w.sum()
    q = b.groupby("surname").w.sum() / b.w.sum()
    return float((p * q.reindex(p.index).fillna(0)).sum())


def chao_shen(counts):
    n = counts.sum()
    singletons = (counts == 1).sum()
    coverage = 1 - singletons / n
    p = coverage * counts / n
    return float(-np.sum(p * np.log(p) / (1 - (1 - p) ** n))), float(coverage)


def half_sample(df, rng):
    """Half of each year without replacement. Resampling with replacement would create
    duplicate articles, and those count as same-surname pairs and inflate Y2."""
    chosen = [rng.choice(idx, len(idx) // 2, replace=False) for idx in df.groupby("year").indices.values()]
    return df.iloc[np.concatenate(chosen)]


def period_stats(df):
    known = df[df.known]
    china, other = known[known.china], known[~known.china]
    return {
        "y2": collision(df), "y2_known": collision(known), "pi": float(known.w[known.china].sum() / known.w.sum()),
        "y_china": collision(china), "y_other": collision(other), "y_cross": overlap(china, other),
    }


def mixture(pi, y_china, y_other, y_cross):
    return pi ** 2 * y_china + (1 - pi) ** 2 * y_other + 2 * pi * (1 - pi) * y_cross


def half_sample_se(point, replicates):
    return float(np.sqrt(np.mean((np.asarray(replicates) - point) ** 2)))


def s10_concentration(core):
    rng = np.random.default_rng(SEED + 500)
    data = core[core.year >= 2000].copy()
    data["span"] = data.year.map(lambda y: PERIODS[min((y - 2000) // 5, 4)])
    pooled = period_stats(data)
    base = (pooled["y_china"], pooled["y_other"], pooled["y_cross"])
    pooled_reps = pd.DataFrame([period_stats(half_sample(data, rng)) for _ in range(N_BOOT)])

    rows = []
    for period in PERIODS:
        sub = data[data.span == period]
        row = {"period": period, "n": int(len(sub)), **period_stats(sub)}
        k = frequencies(equal_probability(sub, rng))
        h, coverage = chao_shen(k)
        row.update(n_equal=int(k.sum()), hill1=float(np.exp(h)), coverage=coverage)
        for group, mask in [("china", sub.known & sub.china), ("other", sub.known & ~sub.china)]:
            kg = frequencies(equal_probability(sub[mask], rng))
            hg, cg = chao_shen(kg)
            row[f"hill1_{group}"] = float(np.exp(hg))
            row[f"coverage_{group}"] = cg
            row[f"n_{group}"] = int(mask.sum())
        replicates = pd.DataFrame([period_stats(half_sample(sub, rng)) for _ in range(N_BOOT)])
        for name in ["y2", "y2_known", "pi", "y_china", "y_other", "y_cross"]:
            se = half_sample_se(row[name], replicates[name])
            row[f"{name}_lo"] = max(0.0, row[name] - Z * se)
            row[f"{name}_hi"] = row[name] + Z * se
        row["null_pooled"] = float(mixture(row["pi"], *base))
        null_reps = mixture(replicates.pi.values, pooled_reps.y_china.values, pooled_reps.y_other.values, pooled_reps.y_cross.values)
        se = half_sample_se(row["null_pooled"], null_reps)
        row["null_lo"] = row["null_pooled"] - Z * se
        row["null_hi"] = row["null_pooled"] + Z * se
        rows.append(row)
    frame = pd.DataFrame(rows)

    annual = []
    for year, sub in data.groupby("year"):
        stats_year = period_stats(sub)
        annual.append({"year": int(year), "pi": stats_year["pi"], "y2": stats_year["y2_known"],
                       "null": float(mixture(stats_year["pi"], *base)), "n_known": int(sub.known.sum())})
    annual = pd.DataFrame(annual)
    residual = np.log(annual.y2.clip(lower=1e-5)) - np.log(annual.null)
    r2 = 1 - ((annual.y2 - annual.null) ** 2).sum() / ((annual.y2 - annual.y2.mean()) ** 2).sum()
    # Slope on log-log against pi: a pure pi^2 term would give 2.
    slope, _ = np.polyfit(np.log(annual.pi[annual.pi > 0]), np.log(annual.y2[annual.pi > 0].clip(lower=1e-5)), 1)

    first, last = frame.iloc[0], frame.iloc[-1]
    observed_change = last.y2_known - first.y2_known
    null_change = last.null_pooled - first.null_pooled
    summary = {
        "y_china": base[0], "y_other": base[1], "y_cross": base[2],
        "y_china_se": half_sample_se(base[0], pooled_reps.y_china), "y_other_se": half_sample_se(base[1], pooled_reps.y_other),
        "y_cross_se": half_sample_se(base[2], pooled_reps.y_cross),
        "observed_change": float(observed_change), "null_change": float(null_change),
        "null_fraction": float(null_change / observed_change), "r2": float(r2), "slope_log_log": float(slope),
        "mean_log_residual": float(residual.mean()),
        "periods_null_inside_ci": int(((frame.null_pooled >= frame.y2_known_lo) & (frame.null_pooled <= frame.y2_known_hi)).sum()),
    }
    path = OUT / "S10_concentration.csv"
    frame.to_csv(path, index=False)
    step("S10_concentration", len(data), len(frame), path)
    annual_path = OUT / "S10_concentration_annual.csv"
    annual.to_csv(annual_path, index=False)
    step("S10_concentration_annual", len(data), len(annual), annual_path)
    return frame.to_dict("records"), annual.to_dict("records"), summary


def main():
    core, full = load()
    recent = core[core.year >= 2000]
    known = recent[recent.known]
    print("kept core", len(core), "all", len(full), flush=True)
    rng = np.random.default_rng(SEED)
    k = frequencies(equal_probability(recent, rng))
    seed_fit = fit_power_law(k)
    china = frequencies(known[known.china]).astype(float)
    base = period_stats(recent)
    print("seed fit", seed_fit, "n", int(k.sum()), "pi", base["pi"], flush=True)
    synthetic = s8_synthetic(int(k.sum()), seed_fit["alpha"], china, base["pi"], base["y_other"])
    print(pd.DataFrame(synthetic).round(3).T.to_string(), flush=True)
    tails, curves = s9_tails(core, full)
    for row in tails:
        print({key: (round(v, 3) if isinstance(v, float) else v) for key, v in row.items() if key != "alternatives"})
        print("   ", json.dumps(row["alternatives"], default=lambda x: round(float(x), 3)), flush=True)
    concentration, annual, mixture_summary = s10_concentration(core)
    print(pd.DataFrame(concentration).round(5).T.to_string(), mixture_summary, sep="\n", flush=True)
    data = {"synthetic": synthetic, "tails": tails, "curves": curves, "concentration": concentration,
            "annual": annual, "mixture": mixture_summary, "n_core_equal": int(k.sum()), "kmin_floor": KMIN_FLOOR,
            "reps": {"gof": N_GOF, "synthetic": N_SYNTH, "synthetic_gof": N_SYNTH_GOF, "half_sample": N_BOOT}, "quick": QUICK}
    path = PAGE / "distribution.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float))
    step("S11_page_data", len(tails), len(tails), path)


if __name__ == "__main__":
    main()
