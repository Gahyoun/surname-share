"""Re-test the tail and mixture claims on the larger self-weighted samples.

Follows the decision rule fixed before these data were analysed and stated on the page.

S13: parse and clean the pooled sample and the yearly snapshots.
S14: tail fits by group, with detection rates simulated at each group's realised n.
S15: out-of-sample test of the mixture null on the snapshots, plus estimate stability.
S16: write docs/surname-share/retest.json for the page.

Usage: python scripts/surname_share_retest.py [--quick]
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_analyze as analyze  # noqa: E402
import surname_share_distribution as dist  # noqa: E402

OUT = dist.OUT
PAGE = dist.PAGE
QUICK = "--quick" in sys.argv
N_DETECT = 20 if QUICK else 200
N_GOF = 40 if QUICK else 300
N_HALF = 50 if QUICK else 1000
SEED = 20261101
TARGET_DETECTION = 0.8
Z = dist.Z
FIXED_KMINS = [5, 10, 20, 40]


def parse(path, label):
    frame = pd.read_csv(path, keep_default_na=False, dtype={"work_id": str})
    n_in = len(frame)
    duplicates = frame[frame.duplicated("work_id")]
    frame = frame.drop_duplicates("work_id").copy()
    duplicates.to_csv(OUT / f"S13_parsed_{label}__dropped.csv", index=False)
    parsed = [analyze.parse_surname(r, d, c.split("|")) for r, d, c in zip(frame.raw_name, frame.display_name, frame.countries)]
    frame["surname"] = [p[0] for p in parsed]
    frame["rule"] = [p[1] for p in parsed]
    frame["china"] = frame.countries.str.split("|").map(lambda c: "CN" in c)
    frame["known"] = frame.countries != ""
    path_out = OUT / f"S13_parsed_{label}.csv"
    frame.to_csv(path_out, index=False)
    dist.step(f"S13_parse_{label}", n_in, len(frame), path_out)
    clean = dist.clean(frame, f"retest_{label}")
    clean["w"] = 1.0
    return clean


def cutoff_test(k, kmin):
    tail = k[k >= kmin].astype(float)
    alpha = dist.fit_alpha(tail, kmin)
    power = dist.log_power_law(tail, kmin, alpha).sum()
    a, lam = dist.maximise(lambda t: dist.log_cutoff(tail, kmin, t[0], abs(t[1]) + 1e-7), [max(alpha - 0.2, 1.05), 1 / tail.max()])
    lr = 2 * (dist.log_cutoff(tail, kmin, a, abs(lam) + 1e-7).sum() - power)
    return float(alpha), float(lr), float(0.5 * stats.chi2.sf(max(lr, 0), 1)), int(len(tail)), float(1 / (abs(lam) + 1e-7))


def detect_one(args):
    kind, n, spread, alpha, names, seed = args
    rng = np.random.default_rng(seed)
    size = rng.lognormal(0, spread, names) if kind == "lognormal" else rng.pareto(alpha - 1, names) + 1
    k = dist.sample_counts(rng, size / size.sum(), n)
    fit = dist.fit_power_law(k)
    return None if fit is None else cutoff_test(k, fit["kmin"])[2] < 0.1


def detection(n, y2, alpha, names):
    spread = float(np.sqrt(np.log(y2 * names)))
    result = {}
    for kind in ("lognormal", "power"):
        jobs = [(kind, n, spread, alpha, names, SEED + i) for i in range(N_DETECT)]
        with ProcessPoolExecutor() as pool:
            hits = [r for r in pool.map(detect_one, jobs) if r is not None]
        result[kind] = float(np.mean(hits)) if hits else None
    return result


def verdict(p, power):
    if p < 0.1:
        return "rejected"
    return "compatible" if power is not None and power >= TARGET_DETECTION else "undecided"


def s14_tails(pooled):
    known = pooled[pooled.known]
    groups = {"non-China": (known[~known.china], 300000), "China": (known[known.china], 8000), "Pooled": (pooled, None)}
    rows = []
    rng = np.random.default_rng(SEED)
    for name, (frame, names) in groups.items():
        k = dist.frequencies(frame)
        fit = dist.fit_power_law(k)
        alpha, lr, p, n_tail, scale = cutoff_test(k, fit["kmin"])
        alternatives = dist.compare_alternatives(k, fit)
        y2 = dist.collision(frame)
        power = detection(int(k.sum()), y2, alpha, names) if names else {"lognormal": None, "power": None}
        boot = []
        for _ in range(N_GOF):
            refit = dist.fit_power_law(rng.choice(k, len(k)))
            if refit:
                boot.append(refit["alpha"])
        fixed = []
        for kmin in FIXED_KMINS:
            if (k >= kmin).sum() >= dist.MIN_TAIL:
                a_k, lr_k, p_k, tail_k, scale_k = cutoff_test(k, kmin)
                fixed.append({"kmin": kmin, "alpha": a_k, "lr": lr_k, "p": p_k, "n_tail": tail_k, "scale": scale_k})
        h, coverage = dist.chao_shen(k)
        rows.append({
            "group": name, "n": int(k.sum()), "n_surnames": int(len(k)), "singletons": int((k == 1).sum()), "k_max": int(k.max()),
            "kmin": fit["kmin"], "n_tail": n_tail, "alpha": alpha, "alpha_lo": float(np.percentile(boot, 2.5)),
            "alpha_hi": float(np.percentile(boot, 97.5)), "lr": lr, "p": p, "cutoff_scale": scale,
            "gof_p": dist.gof_pvalue(k, fit, N_GOF, rng), "exponential_R": alternatives["exponential"]["R"],
            "exponential_p": alternatives["exponential"]["p"], "lognormal_R": alternatives["lognormal"]["R"],
            "lognormal_p": alternatives["lognormal"]["p"], "detect_lognormal": power["lognormal"], "false_positive": power["power"],
            "verdict": verdict(p, power["lognormal"]) if name != "Pooled" else "descriptive", "fixed": fixed,
            "y2": y2, "effective": 1 / y2, "hill1": float(np.exp(h)), "coverage": coverage,
        })
        print({key: (round(v, 4) if isinstance(v, float) else v) for key, v in rows[-1].items()}, flush=True)
    path = OUT / "S14_retest_fits.csv"
    pd.DataFrame([{key: v for key, v in r.items() if key != "fixed"} for r in rows]).to_csv(path, index=False)
    dist.step("S14_retest_fits", len(groups), len(rows), path)
    return rows


def s15_out_of_sample(snapshots, pooled):
    old = json.loads((PAGE / "distribution.json").read_text())["mixture"]
    frozen = (old["y_china"], old["y_other"], old["y_cross"])
    rng = np.random.default_rng(SEED + 1)
    rows = []
    for year, sub in snapshots.groupby("snapshot"):
        sub = sub.assign(year=year)
        point = dist.period_stats(sub)
        replicates = pd.DataFrame([dist.period_stats(dist.half_sample(sub, rng)) for _ in range(N_HALF)])
        row = {"snapshot": int(year), "n": int(len(sub)), "known": float(sub.known.mean()), **point}
        for name in ["y2_known", "pi", "y_china", "y_other", "y_cross"]:
            se = dist.half_sample_se(point[name], replicates[name])
            row[f"{name}_lo"] = point[name] - Z * se
            row[f"{name}_hi"] = point[name] + Z * se
        row["predicted"] = float(dist.mixture(point["pi"], *frozen))
        row["inside"] = bool(row["y2_known_lo"] <= row["predicted"] <= row["y2_known_hi"])
        for surname in analyze.TARGETS:
            row[surname] = float((sub.surname == surname).mean())
        rows.append(row)
    frame = pd.DataFrame(rows)
    first, last = frame.iloc[0], frame.iloc[-1]
    r2 = 1 - ((frame.y2_known - frame.predicted) ** 2).sum() / ((frame.y2_known - frame.y2_known.mean()) ** 2).sum()
    summary = {"observed_change": float(last.y2_known - first.y2_known), "predicted_change": float(last.predicted - first.predicted),
               "fraction": float((last.predicted - first.predicted) / (last.y2_known - first.y2_known)), "r2": float(r2),
               "inside": int(frame.inside.sum()), "n_snapshots": int(len(frame)), "frozen": dict(zip(("y_china", "y_other", "y_cross"), frozen))}
    pooled_stats = dist.period_stats(pooled.assign(year=0))
    path = OUT / "S15_out_of_sample.csv"
    frame.to_csv(path, index=False)
    dist.step("S15_out_of_sample", len(snapshots), len(frame), path)
    return rows, summary, pooled_stats


def main():
    pooled = parse(OUT / "S2d_pooled.csv", "pooled")
    snapshots = parse(OUT / "S2c_snapshots.csv", "snapshots")
    print("pooled", len(pooled), "snapshots", len(snapshots), flush=True)
    rows, summary, pooled_stats = s15_out_of_sample(snapshots, pooled)
    print(pd.DataFrame(rows).round(5).T.to_string(), summary, pooled_stats, sep="\n", flush=True)
    fits = s14_tails(pooled)
    data = {"fits": fits, "snapshots": rows, "out_of_sample": summary, "pooled_stats": pooled_stats,
            "rule": {"target_detection": TARGET_DETECTION}, "reps": {"detection": N_DETECT, "gof": N_GOF, "half_sample": N_HALF}, "quick": QUICK}
    path = PAGE / "retest.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float))
    dist.step("S16_page_data", len(fits), len(fits), path)


if __name__ == "__main__":
    main()
