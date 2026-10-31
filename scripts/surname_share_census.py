"""Census of first authors from the OpenAlex parquet snapshot, with no sampling.

Reads only the needed columns over HTTP range requests, so the 744 GB release is not
stored. Needs pyarrow. Thin per-file output goes to CENSUS_DIR, which should sit outside
synced folders (about 20 GB).

S30: one thin parquet per snapshot file, plus row counts by outcome in its .json sidecar.
S39: exact counts by field, surname, corpus and period; writes docs/census.json.

Usage: CENSUS_DIR=/path python scripts/surname_share_census.py extract [--limit N] [--workers N]
       CENSUS_DIR=/path python scripts/surname_share_census.py tabulate [--workers N]
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import pandas as pd
import pyarrow as pa
import pyarrow.compute as pc
import pyarrow.fs as pafs
import pyarrow.parquet as pq

sys.path.insert(0, str(Path(__file__).resolve().parent))
import surname_share_analyze as analyze  # noqa: E402

CENSUS = Path(os.environ.get("CENSUS_DIR", "census"))
MANIFEST = "https://openalex.s3.amazonaws.com/data/parquet/works/manifest.json"
FIRST_YEAR, LAST_YEAR = 1975, 2025
RECENT = 2020
COLUMNS = ["publication_year", "type", "authors_count", "authorships.list.element.author.display_name",
           "authorships.list.element.author_position", "authorships.list.element.countries.list.element",
           "authorships.list.element.raw_author_name", "primary_topic.subfield.id", "primary_topic.field.id",
           "primary_location.source.is_core", "is_xpac"]
SCHEMA = pa.schema([("year", pa.int16()), ("field", pa.int8()), ("subfield", pa.int16()), ("core", pa.bool_()), ("china", pa.int8()),
                    ("et_al", pa.bool_()), ("xpac", pa.bool_()), ("surname", pa.string()), ("rule", pa.dictionary(pa.int8(), pa.string()))])


def taxon(value):
    return int(value.rsplit("/", 1)[-1]) if value else 0


def extract_table(table, cache, counts):
    columns = {k: [] for k in SCHEMA.names}
    for row in table.to_pylist():
        counts["works"] += 1
        year, authors = row["publication_year"], row["authorships"] or []
        if row["type"] != "article":
            counts["not_article"] += 1
        elif year is None or not FIRST_YEAR <= year <= LAST_YEAR:
            counts["year_outside"] += 1
        elif not authors or not row["authors_count"]:
            counts["no_authors"] += 1
        else:
            first = next((a for a in authors if a["author_position"] == "first"), authors[0])
            raw, display = first["raw_author_name"] or "", (first["author"] or {})["display_name"] if first["author"] else ""
            countries = first["countries"] or []
            sino = tuple(c for c in countries if c in analyze.SINOSPHERE)
            key = (raw, display, sino, not countries)
            if key not in cache:
                cache[key] = analyze.parse_surname(raw, display, countries)
            surname, rule = cache[key]
            topic, location = row["primary_topic"] or {}, row["primary_location"] or {}
            columns["year"].append(year)
            columns["field"].append(taxon((topic.get("field") or {}).get("id")))
            columns["subfield"].append(taxon((topic.get("subfield") or {}).get("id")))
            columns["core"].append(bool((location.get("source") or {}).get("is_core")))
            columns["china"].append(-1 if not countries else int("CN" in countries))
            columns["et_al"].append(len(authors) >= 3)
            columns["xpac"].append(bool(row["is_xpac"]))
            columns["surname"].append(surname)
            columns["rule"].append(rule)
            counts["kept"] += 1
    return pa.table(columns, schema=SCHEMA)


def extract_file(url):
    name = url.replace("s3://openalex/data/parquet/works/", "").replace("updated_date=", "").replace("/part_", "_").replace(".parquet", "")
    out = CENSUS / f"{name}.parquet"
    if out.exists():
        return name, None
    s3 = pafs.S3FileSystem(anonymous=True, region="us-east-1", retry_strategy=pafs.AwsStandardS3RetryStrategy(max_attempts=8))
    start = time.time()
    with s3.open_input_file(url.replace("s3://", "")) as handle:
        source = pq.ParquetFile(handle, pre_buffer=True)
        counts = {"works": 0, "not_article": 0, "year_outside": 0, "no_authors": 0, "kept": 0}
        cache = {}
        temporary = out.with_suffix(".part")
        with pq.ParquetWriter(temporary, SCHEMA, compression="zstd", compression_level=6) as writer:
            for group in range(source.num_row_groups):
                writer.write_table(extract_table(source.read_row_group(group, columns=COLUMNS), cache, counts))
    counts["seconds"] = round(time.time() - start, 1)
    out.with_suffix(".json").write_text(json.dumps(counts))
    temporary.rename(out)
    return name, counts


def extract(limit, workers):
    CENSUS.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(MANIFEST, timeout=120) as response:
        manifest = json.load(response)
    (CENSUS / "manifest.json").write_text(json.dumps({k: v for k, v in manifest.items() if k != "files"}))
    files = sorted(manifest["files"], key=lambda f: f["meta"]["content_length"])
    urls = [f["url"] for f in files[-limit:]] if limit else [f["url"] for f in files]
    done = 0
    with ProcessPoolExecutor(workers) as pool:
        futures = {pool.submit(extract_file, url): url for url in urls}
        for future in as_completed(futures):
            try:
                name, counts = future.result()
            except Exception as error:  # a rerun picks up failed files
                print("FAILED", futures[future], repr(error)[:200], flush=True)
                continue
            done += 1
            if counts:
                print(done, len(urls), name, counts, flush=True)


def count_file(path):
    table = pq.read_table(path, columns=["year", "field", "core", "xpac", "surname"])
    label = pc.if_else(pc.is_in(table["surname"], value_set=pa.array(analyze.TARGETS)), table["surname"], pa.scalar("other"))
    recent = pc.greater_equal(table["year"], RECENT)
    frame = pa.table({"field": table["field"], "core": table["core"], "xpac": table["xpac"], "recent": recent, "surname": label})
    return frame.group_by(["field", "core", "xpac", "recent", "surname"]).aggregate([("field", "count")]).to_pandas()


def shares(frame, field, corpus):
    rows = []
    papers = frame.groupby("surname").n.sum()
    recent = frame[frame.recent].groupby("surname").n.sum()
    total, total_recent = int(papers.sum()), int(recent.sum())
    for label in ["All five"] + analyze.TARGETS:
        hits = int(papers.reindex(analyze.TARGETS).sum()) if label == "All five" else int(papers.get(label, 0))
        hits_recent = int(recent.reindex(analyze.TARGETS).sum()) if label == "All five" else int(recent.get(label, 0))
        share, share_recent = hits / total, hits_recent / max(total_recent, 1)
        rows.append({"corpus": corpus, "field": field, "surname": label, "share": share, "recent_share": share_recent, "hits": hits, "hits_recent": hits_recent,
                     "n_all": total, "n_recent": total_recent, "papers": hits})
    return rows


def tabulate(workers):
    paths = sorted(CENSUS.glob("*.parquet"))
    with ProcessPoolExecutor(workers) as pool:
        parts = list(pool.map(count_file, paths, chunksize=8))
    counts = pd.concat(parts).groupby(["field", "core", "xpac", "recent", "surname"], as_index=False).field_count.sum().rename(columns={"field_count": "n"})
    names = pd.read_csv(analyze.OUT / "S1_strata.csv").drop_duplicates("field_id").set_index("field_id").field
    counts["field_name"] = counts.field.map(names)
    path = analyze.OUT / "S39_census_field.csv"
    counts.to_csv(path, index=False)
    sidecars = [json.loads(p.with_suffix(".json").read_text()) for p in paths]
    outcome = {k: sum(c[k] for c in sidecars) for k in ("works", "not_article", "year_outside", "no_authors", "kept")}
    analyze.step("S39_census_field", outcome["kept"], len(counts), path)
    # The API leaves xpac records out by default, and every sample on the page came from the API.
    outcome["xpac"] = int(counts[counts.xpac].n.sum())
    counts = counts[~counts.xpac]
    by_field, overall = [], []
    for corpus, part in [("all", counts), ("core", counts[counts.core])]:
        overall += shares(part, "", corpus)
        for field, group in part[part.field_name.notna()].groupby("field_name"):
            by_field += shares(group, field, corpus)
    unfielded = int(counts[counts.field_name.isna()].n.sum())
    manifest = json.loads((CENSUS / "manifest.json").read_text())
    data = {"release": {k: v for k, v in manifest.items() if isinstance(v, (str, int))}, "files": len(paths), "outcome": outcome, "unfielded": unfielded, "overall": overall, "by_field": by_field}
    (analyze.PAGE / "census.json").write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":"), allow_nan=False))
    print(outcome, unfielded)
    print(pd.DataFrame(overall)[["corpus", "surname", "share", "recent_share", "hits", "n_all", "n_recent"]].round(5).to_string())


if __name__ == "__main__":
    args = sys.argv[1:]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else 0
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 12
    tabulate(workers) if args and args[0] == "tabulate" else extract(limit, workers)
