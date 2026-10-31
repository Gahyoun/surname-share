"""Collect a stratified OpenAlex sample of journal articles for the surname-share page.

S1: exact article counts by field x period (the stratum sizes).
S2: a seeded uniform sample per stratum, one row per work with its first author.

Output goes to data/. Each API response is cached, so a rerun
resumes where the last one stopped (the anonymous budget is 1000 calls a day).

Usage: OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py
"""
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "data"
CACHE = OUT / "cache"
API = "https://api.openalex.org/works"
MAILTO = os.environ.get("OPENALEX_MAILTO", "")

PERIODS = [(y, y + 4) for y in range(1975, 2020, 5)] + [(2020, 2025)]
SAMPLE_SIZE = 600
PAGE_SIZE = 200
BASE_FILTER = "type:article,authors_count:>0"
SNAPSHOT_YEARS = [2000, 2005, 2010, 2015, 2020, 2025]
SNAPSHOT_PAGES = 50
POOLED_SEEDS = 3
FIELD_PERIODS = ["2000-2004", "2005-2009", "2010-2014", "2015-2019", "2020-2025"]
FIELD_PAGES = 3
SUBFIELDS = {
    "1702": "Artificial Intelligence",
    "1707": "Computer Vision and Pattern Recognition",
    "1705": "Computer Networks and Communications",
    "1710": "Information Systems",
}


def period_label(start, end):
    return f"{start}-{end}"


def period_filter(start, end):
    return f"{BASE_FILTER},from_publication_date:{start}-01-01,to_publication_date:{end}-12-31"


def get(params, cache_name):
    path = CACHE / f"{cache_name}.json"
    if path.exists():
        return json.loads(path.read_text())
    params = dict(params)
    if MAILTO:
        params["mailto"] = MAILTO
    url = f"{API}?{urllib.parse.urlencode(params, safe=':,>')}"
    for attempt in range(8):
        try:
            with urllib.request.urlopen(url, timeout=60) as response:
                remaining = response.headers.get("x-ratelimit-remaining-usd")
                body = response.read().decode()
            data = json.loads(body)
            path.write_text(body)
            print(f"ok {cache_name} remaining_usd={remaining}", flush=True)
            time.sleep(0.2)
            return data
        except urllib.error.HTTPError as error:
            wait = int(error.headers.get("retry-after") or 2 ** attempt)
            print(f"http {error.code} {cache_name}, wait {wait}s", flush=True)
            if error.code == 429 and wait > 600:
                sys.exit("daily budget exhausted; rerun after the reset")
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as error:
            print(f"net {error} {cache_name}", flush=True)
            time.sleep(2 ** attempt)
    sys.exit(f"gave up on {cache_name}")


def s1_strata():
    rows = []
    for start, end in PERIODS:
        label = period_label(start, end)
        data = get(
            {"filter": period_filter(start, end), "group_by": "primary_topic.field.id", "per-page": 40},
            f"S1_{label}",
        )
        for group in data["group_by"]:
            rows.append({
                "period": label,
                "field_id": group["key"].rsplit("/", 1)[-1],
                "field": group["key_display_name"],
                "n_articles": group["count"],
            })
    yearly = get(
        {"filter": period_filter(1975, 2025), "group_by": "publication_year", "per-page": 60},
        "S1_years",
    )
    with open(OUT / "S1_strata.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=rows[0].keys())
        writer.writeheader()
        writer.writerows(rows)
    with open(OUT / "S1_year_totals.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["year", "n_articles"])
        for group in sorted(yearly["group_by"], key=lambda g: g["key"]):
            writer.writerow([group["key"], group["count"]])
    return rows


def s2_sample(strata):
    columns = ["work_id", "period", "field_id", "year", "n_authors", "raw_name", "display_name", "countries"]
    with open(OUT / "S2_sample.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for stratum in strata:
            start = int(stratum["period"].split("-")[0])
            end = int(stratum["period"].split("-")[1])
            size = min(SAMPLE_SIZE, stratum["n_articles"])
            pages = (size + PAGE_SIZE - 1) // PAGE_SIZE
            seed = start * 100 + int(stratum["field_id"])
            for page in range(1, pages + 1):
                data = get(
                    {
                        "filter": f"{period_filter(start, end)},primary_topic.field.id:{stratum['field_id']}",
                        "sample": size,
                        "seed": seed,
                        "per-page": PAGE_SIZE,
                        "page": page,
                        "select": "id,publication_year,authorships",
                    },
                    f"S2_{stratum['period']}_{stratum['field_id']}_{page}",
                )
                for work in data["results"]:
                    authors = work["authorships"]
                    first = next((a for a in authors if a["author_position"] == "first"), authors[0] if authors else None)
                    if first is None:
                        continue
                    writer.writerow({
                        "work_id": work["id"].rsplit("/", 1)[-1],
                        "period": stratum["period"],
                        "field_id": stratum["field_id"],
                        "year": work["publication_year"],
                        "n_authors": len(authors),
                        "raw_name": first.get("raw_author_name") or "",
                        "display_name": (first.get("author") or {}).get("display_name") or "",
                        "countries": "|".join(first.get("countries") or []),
                    })


def s1b_exact_series():
    """Exact yearly counts. Core sources show the coverage shift the full index hides."""
    base = period_filter(1975, 2025)
    core = f"{base},primary_location.source.is_core:true"
    china = "authorships.countries:countries/cn"
    queries = {
        "core_all": core,
        "core_cn": f"{core},{china}",
        "all_cn": f"{base},{china}",
        "core_zh": f"{core},raw_author_name.search:Zhang",
    }
    series = {}
    for name, filter_text in queries.items():
        data = get({"filter": filter_text, "group_by": "publication_year", "per-page": 60}, f"S1b_{name}")
        series[name] = {int(g["key"]): g["count"] for g in data["group_by"]}
    with open(OUT / "S1b_exact_series.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["year", *queries])
        for year in range(1975, 2026):
            writer.writerow([year, *(series[name].get(year, 0) for name in queries)])
    return series["core_all"]


def s2b_core_sample(core_counts):
    """Year-stratified sample of core-source articles; the field comes from primary_topic."""
    columns = ["work_id", "year", "field", "n_authors", "raw_name", "display_name", "countries"]
    with open(OUT / "S2b_core_sample.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for year in range(1975, 2026):
            pages = 1 if year < 2000 else 5
            size = min(pages * PAGE_SIZE, core_counts[year])
            for page in range(1, pages + 1):
                data = get(
                    {
                        "filter": f"{period_filter(year, year)},primary_location.source.is_core:true",
                        "sample": size,
                        "seed": year,
                        "per-page": PAGE_SIZE,
                        "page": page,
                        "select": "id,publication_year,authorships,primary_topic",
                    },
                    f"S2b_{year}_{page}",
                )
                for work in data["results"]:
                    authors = work["authorships"]
                    first = next((a for a in authors if a["author_position"] == "first"), authors[0] if authors else None)
                    if first is None:
                        continue
                    topic = work.get("primary_topic") or {}
                    writer.writerow({
                        "work_id": work["id"].rsplit("/", 1)[-1],
                        "year": work["publication_year"],
                        "field": (topic.get("field") or {}).get("display_name") or "",
                        "n_authors": len(authors),
                        "raw_name": first.get("raw_author_name") or "",
                        "display_name": (first.get("author") or {}).get("display_name") or "",
                        "countries": "|".join(first.get("countries") or []),
                    })


def write_first_authors(writer, data, extra):
    for work in data["results"]:
        authors = work["authorships"]
        first = next((a for a in authors if a["author_position"] == "first"), authors[0] if authors else None)
        if first is None:
            continue
        writer.writerow({
            **extra,
            "work_id": work["id"].rsplit("/", 1)[-1],
            "year": work["publication_year"],
            "n_authors": len(authors),
            "raw_name": first.get("raw_author_name") or "",
            "display_name": (first.get("author") or {}).get("display_name") or "",
            "countries": "|".join(first.get("countries") or []),
        })


def s2c_snapshots():
    """Self-weighted core snapshots, so no design weights enter the frequency counts."""
    columns = ["snapshot", "work_id", "year", "n_authors", "raw_name", "display_name", "countries"]
    with open(OUT / "S2c_snapshots.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for year in SNAPSHOT_YEARS:
            for page in range(1, SNAPSHOT_PAGES + 1):
                data = get(
                    {
                        "filter": f"{period_filter(year, year)},primary_location.source.is_core:true",
                        "sample": SNAPSHOT_PAGES * PAGE_SIZE,
                        "seed": year,
                        "per-page": PAGE_SIZE,
                        "page": page,
                        "select": "id,publication_year,authorships",
                    },
                    f"S2c_{year}_{page}",
                )
                write_first_authors(writer, data, {"snapshot": year})


def s2d_pooled():
    """One self-weighted stratum over 2000-2025, drawn under several seeds to pass the 10,000 cap."""
    columns = ["seed", "work_id", "year", "n_authors", "raw_name", "display_name", "countries"]
    with open(OUT / "S2d_pooled.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for seed in range(1, POOLED_SEEDS + 1):
            for page in range(1, SNAPSHOT_PAGES + 1):
                data = get(
                    {
                        "filter": f"{BASE_FILTER},from_publication_date:2000-01-01,to_publication_date:2025-12-31,"
                                  "primary_location.source.is_core:true",
                        "sample": SNAPSHOT_PAGES * PAGE_SIZE,
                        "seed": seed,
                        "per-page": PAGE_SIZE,
                        "page": page,
                        "select": "id,publication_year,authorships",
                    },
                    f"S2d_{seed}_{page}",
                )
                write_first_authors(writer, data, {"seed": seed})


def field_strata():
    with open(OUT / "S1_strata.csv", encoding="utf-8") as f:
        fields = {row["field_id"]: row["field"] for row in csv.DictReader(f)}
    strata = [("field", key, name) for key, name in sorted(fields.items(), key=lambda kv: int(kv[0]))]
    return strata + [("subfield", key, name) for key, name in SUBFIELDS.items()]


def stratum_filter(level, key):
    return f"primary_topic.{level}.id:{key}"


def s1c_field_series():
    """Exact yearly totals in core sources by field, and those with a China-affiliated author."""
    base = f"{period_filter(2000, 2025)},primary_location.source.is_core:true"
    with open(OUT / "S1c_field_series.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["level", "key", "name", "year", "n_articles", "n_china"])
        for level, key, name in field_strata():
            totals = get({"filter": f"{base},{stratum_filter(level, key)}", "group_by": "publication_year", "per-page": 40},
                         f"S1c_{level}_{key}_all")
            china = get({"filter": f"{base},{stratum_filter(level, key)},authorships.countries:countries/cn",
                         "group_by": "publication_year", "per-page": 40}, f"S1c_{level}_{key}_cn")
            china_by_year = {g["key"]: g["count"] for g in china["group_by"]}
            for group in sorted(totals["group_by"], key=lambda g: g["key"]):
                writer.writerow([level, key, name, group["key"], group["count"], china_by_year.get(group["key"], 0)])


def s2e_field_sample():
    """First authors by field or subfield x period in core sources."""
    with open(OUT / "S1c_field_series.csv", encoding="utf-8") as f:
        sizes = {}
        for row in csv.DictReader(f):
            year = int(row["year"])
            period = FIELD_PERIODS[min((year - 2000) // 5, len(FIELD_PERIODS) - 1)]
            cell = (row["level"], row["key"], period)
            sizes[cell] = sizes.get(cell, 0) + int(row["n_articles"])
    columns = ["level", "key", "name", "period", "n_stratum", "work_id", "year", "n_authors", "raw_name", "display_name", "countries"]
    with open(OUT / "S2e_field_sample.csv", "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=columns)
        writer.writeheader()
        for level, key, name in field_strata():
            for period in FIELD_PERIODS:
                start, end = (int(x) for x in period.split("-"))
                n_stratum = sizes.get((level, key, period), 0)
                size = min(FIELD_PAGES * PAGE_SIZE, n_stratum)
                for page in range(1, (size + PAGE_SIZE - 1) // PAGE_SIZE + 1):
                    data = get(
                        {
                            "filter": f"{period_filter(start, end)},primary_location.source.is_core:true,{stratum_filter(level, key)}",
                            "sample": size,
                            "seed": start * 10 + int(key) % 997,
                            "per-page": PAGE_SIZE,
                            "page": page,
                            "select": "id,publication_year,authorships",
                        },
                        f"S2e_{level}_{key}_{start}_{page}",
                    )
                    write_first_authors(writer, data, {"level": level, "key": key, "name": name, "period": period, "n_stratum": n_stratum})


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    if "--fields" in sys.argv:
        s1c_field_series()
        print("S1c done", flush=True)
        s2e_field_sample()
        print("S2e done", flush=True)
        sys.exit(0)
    if "--pooled" in sys.argv:
        s2d_pooled()
        print("S2d done", flush=True)
        sys.exit(0)
    if "--snapshots" in sys.argv:
        s2c_snapshots()
        print("S2c done", flush=True)
        sys.exit(0)
    strata = s1_strata()
    print(f"S1 strata: {len(strata)}", flush=True)
    s2_sample(strata)
    print("S2 done", flush=True)
    core_counts = s1b_exact_series()
    s2b_core_sample(core_counts)
    print("S2b done", flush=True)
