"""Measurement checks for the surname sets: is E comparable across time and countries?

A surname set stands in for "first authors tied to a country". Each step asks how far that
stand-in holds, using only samples already collected.

S32: family-first names missed by the parser, and E after counting them.
S33: precision and recall of each set against recorded country affiliation, by snapshot.
S34: missing affiliation by snapshot, and E on the known and the full base.
S35: E by sub-period, since one endpoint ratio hides reversals.
S36: E by team size, since being first author depends on the size of the team.
S37: E with field weights held fixed, to remove change in field composition.
S38: write docs/surname-share/validity.json for the page.

Usage: python scripts/surname_share_validity.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_analyze as analyze  # noqa: E402
import surname_share_common as common  # noqa: E402
import surname_share_distribution as dist  # noqa: E402
import surname_share_fields as fields  # noqa: E402

OUT = dist.OUT
PAGE = dist.PAGE
NAMES = {"CN": "중국", "IN": "인도", "KR": "한국"}
SIZE = {"CN": 100, "IN": 20, "KR": 20}
BREAK = 2015
TEAMS = [("1명", 1, 1), ("2–3명", 2, 3), ("4명 이상", 4, 10 ** 6)]


def has(frame, code):
    return frame.countries.str.split("|").map(lambda c: code in c)


def load_sets():
    china = pd.read_csv(OUT / "S23_surname_sets.csv", keep_default_na=False)
    others = pd.read_csv(OUT / "S27_other_sets.csv", keep_default_na=False)
    sets = {"CN": list(china.surname[:SIZE["CN"]])}
    for code in ("IN", "KR"):
        sets[code] = list(others[others.country == code].surname[:SIZE[code]])
    return sets


def family_first(frame, names):
    """True where the first token is in the set and the parser took another token."""
    def check(raw, surname, rule):
        parts = analyze.tokens(raw)
        return rule == "last_token" and 1 < len(parts) <= 3 and parts[0].title() in names and surname not in names
    return pd.Series([check(r, s, u) for r, s, u in zip(frame.raw_name, frame.surname, frame.rule)], index=frame.index)


def e_row(a, b, mask_a, mask_b):
    h1, h2 = int(mask_a.sum()), int(mask_b.sum())
    e, lo, hi = common.ratio(h1, len(a), h2, len(b))
    return {"hits_first": h1, "hits_last": h2, "share_first": h1 / len(a), "share_last": h2 / len(b), "e": e, "lo": lo, "hi": hi}


def s32_order(snapshots, sets):
    a, b = snapshots[snapshots.snapshot == snapshots.snapshot.min()], snapshots[snapshots.snapshot == snapshots.snapshot.max()]
    rows, frames = [], []
    for code, names in sets.items():
        extra_a, extra_b = family_first(a, names), family_first(b, names)
        base = e_row(a, b, a.surname.isin(names), b.surname.isin(names))
        fixed = e_row(a, b, a.surname.isin(names) | extra_a, b.surname.isin(names) | extra_b)
        inside_a, inside_b = has(a, code), has(b, code)
        rows.append({"country": code, "e": base["e"], "e_fixed": fixed["e"], "lo_fixed": fixed["lo"], "hi_fixed": fixed["hi"], "extra_first": int(extra_a.sum()), "extra_last": int(extra_b.sum()),
                     "in_rate_first": float(extra_a[inside_a].mean()), "in_rate_last": float(extra_b[inside_b].mean())})
        frames.append(pd.concat([a[extra_a], b[extra_b]]).assign(country=code)[["country", "snapshot", "raw_name", "surname", "countries"]])
    path = OUT / "S32_family_first.csv"
    pd.concat(frames).to_csv(path, index=False)
    dist.step("S32_family_first", len(a) + len(b), sum(len(f) for f in frames), path)
    return rows


def s33_proxy(snapshots, sets):
    rows = []
    known = snapshots[snapshots.known]
    for code, names in sets.items():
        for year, group in known.groupby("snapshot"):
            inside, hit = has(group, code), group.surname.isin(names)
            rows.append({"country": code, "year": int(year), "pi": float(inside.mean()), "precision": float(inside[hit].mean()), "recall": float(hit[inside].mean()),
                         "hits": int(hit.sum()), "n_inside": int(inside.sum()), "other_rate": float(hit[~inside].mean())})
    frame = pd.DataFrame(rows)
    path = OUT / "S33_proxy_validity.csv"
    frame.to_csv(path, index=False)
    dist.step("S33_proxy_validity", len(known), len(frame), path)
    return rows


def s34_missing(snapshots, sets):
    rows = []
    for code, names in sets.items():
        for year, group in snapshots.groupby("snapshot"):
            lost = group[~group.known]
            rows.append({"country": code, "year": int(year), "unknown": float(1 - group.known.mean()), "share_known": float(group[group.known].surname.isin(names).mean()), "share_unknown": float(lost.surname.isin(names).mean())})
    frame = pd.DataFrame(rows)
    path = OUT / "S34_missing.csv"
    frame.to_csv(path, index=False)
    dist.step("S34_missing", len(snapshots), len(frame), path)
    return rows


def s35_periods(snapshots, sets):
    years = sorted(snapshots.snapshot.unique())
    spans = [(years[0], BREAK), (BREAK, years[-1]), (years[0], years[-1])]
    rows = []
    for code, names in sets.items():
        for start, end in spans:
            a, b = snapshots[snapshots.snapshot == start], snapshots[snapshots.snapshot == end]
            rows.append({"country": code, "start": int(start), "end": int(end), **e_row(a, b, a.surname.isin(names), b.surname.isin(names))})
    frame = pd.DataFrame(rows)
    path = OUT / "S35_periods.csv"
    frame.to_csv(path, index=False)
    dist.step("S35_periods", len(snapshots), len(frame), path)
    return rows


def s36_team(snapshots, sets):
    a, b = snapshots[snapshots.snapshot == snapshots.snapshot.min()], snapshots[snapshots.snapshot == snapshots.snapshot.max()]
    teams_a, teams_b = pd.to_numeric(a.n_authors, errors="coerce"), pd.to_numeric(b.n_authors, errors="coerce")
    rows = []
    for code, names in sets.items():
        for label, low, high in TEAMS:
            part_a, part_b = a[teams_a.between(low, high)], b[teams_b.between(low, high)]
            rows.append({"country": code, "team": label, "n_first": len(part_a), "n_last": len(part_b), "weight_first": len(part_a) / len(a), "weight_last": len(part_b) / len(b),
                         **e_row(part_a, part_b, part_a.surname.isin(names), part_b.surname.isin(names))})
    frame = pd.DataFrame(rows)
    path = OUT / "S36_team.csv"
    frame.to_csv(path, index=False)
    dist.step("S36_team", len(a) + len(b), len(frame), path)
    return rows


def s37_standard(sets):
    frame = fields.load()
    frame = frame[frame.level == "field"]
    _, exact = fields.exact_series()
    rows = []
    for code, names in sets.items():
        counts = frame.assign(hit=frame.surname.isin(names)).groupby(["key", "name", "period"], as_index=False).agg(n=("work_id", "size"), hits=("hit", "sum"))
        cell = exact[exact.level == "field"].merge(counts, on=["key", "name", "period"])
        wide = cell.assign(share=(cell.hits + 0.5) / (cell.n + 1)).pivot(index="name", columns="period", values=["share", "per_year"])
        s1, s2 = wide["share"][fields.EARLY], wide["share"][fields.LATE]
        w1, w2 = wide["per_year"][fields.EARLY] / wide["per_year"][fields.EARLY].sum(), wide["per_year"][fields.LATE] / wide["per_year"][fields.LATE].sum()
        rows.append({"country": code, "e_weighted": float((w2 * s2).sum() / (w1 * s1).sum()), "e_early_weights": float((w1 * s2).sum() / (w1 * s1).sum()), "e_late_weights": float((w2 * s2).sum() / (w2 * s1).sum())})
    table = pd.DataFrame(rows)
    path = OUT / "S37_standardized.csv"
    table.to_csv(path, index=False)
    dist.step("S37_standardized", len(frame), len(table), path)
    return rows


def main():
    sets = load_sets()
    snapshots = dist.clean(common.read_flags("S13_parsed_snapshots.csv"), "validity_snapshots")
    order = s32_order(snapshots, sets)
    proxy = s33_proxy(snapshots, sets)
    missing = s34_missing(snapshots, sets)
    periods = s35_periods(snapshots, sets)
    team = s36_team(snapshots, sets)
    standard = s37_standard(sets)
    for rows in (order, proxy, missing, periods, team, standard):
        print(pd.DataFrame(rows).round(3).to_string())
    data = {"names": NAMES, "size": SIZE, "order": order, "proxy": proxy, "missing": missing, "periods": periods, "team": team, "standard": standard}
    path = PAGE / "validity.json"
    path.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), default=float, allow_nan=False))
    dist.step("S38_validity_page", len(proxy), len(proxy), path)


if __name__ == "__main__":
    main()
