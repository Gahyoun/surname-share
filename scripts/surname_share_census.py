"""Census of first authors from the OpenAlex parquet snapshot, with no sampling.

Reads only the needed columns over HTTP range requests, so the 744 GB release is not
stored. Needs pyarrow. Thin per-file output goes to CENSUS_DIR, which should sit outside
synced folders (about 20 GB).

S30: one thin parquet per snapshot file, plus row counts by outcome in its .json sidecar.
S39: exact counts by field, surname, corpus and period; writes docs/census.json.
S40: exact counts by year, field, corpus, China affiliation and surname, without xpac records.
S41: every replaced sample estimate against the census value.
S42: yearly, field-by-period, trend and decomposition tables, added to census.json.

Usage: CENSUS_DIR=/path python scripts/surname_share_census.py extract [--limit N] [--workers N]
       CENSUS_DIR=/path python scripts/surname_share_census.py tabulate [--workers N]
       CENSUS_DIR=/path python scripts/surname_share_census.py series [--workers N]
"""
import json
import os
import sys
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor, as_completed
from itertools import repeat
from pathlib import Path

import numpy as np
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
BLOCK, BOOTSTRAP = 3, 500
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


def count_cube(path, names):
    table = pq.read_table(path, columns=["year", "field", "core", "xpac", "china", "et_al", "surname"])
    table = table.filter(pc.invert(table["xpac"]))
    label = pc.if_else(pc.is_in(table["surname"], value_set=pa.array(names)), table["surname"], pa.scalar("other"))
    frame = table.select(["year", "field", "core", "china", "et_al"]).append_column("surname", label)
    return frame.group_by(["year", "field", "core", "china", "et_al", "surname"]).aggregate([("year", "count")]).to_pandas()


def named(frame, label):
    return frame[frame.surname.isin(analyze.TARGETS)] if label == "All five" else frame[frame.surname == label]


def bootstrap_trend(years, y, rng):
    """Year-to-year fluctuation around the trend, by moving blocks of residuals; a census has no sampling error."""
    recent = years >= 2000
    fit, line = analyze.segmented(years, y), np.polyfit(years[recent], y[recent], 1)
    tau = fit["break_year"]
    X = np.column_stack([np.ones_like(years), years - tau, np.clip(years - tau, 0, None)])
    beta = np.linalg.lstsq(X, y, rcond=None)[0]
    piecewise, residual = X @ beta, y - X @ beta
    residual_line = y[recent] - np.polyval(line, years[recent])

    def blocks(values):
        starts = rng.integers(0, len(values) - BLOCK + 1, len(values) // BLOCK + 1)
        return np.concatenate([values[s:s + BLOCK] for s in starts])[:len(values)]
    taus = [analyze.segmented(years, piecewise + blocks(residual))["break_year"] for _ in range(BOOTSTRAP)]
    slopes = [np.polyfit(years[recent], np.polyval(line, years[recent]) + blocks(residual_line), 1)[0] for _ in range(BOOTSTRAP)]
    fit.update({"growth": float(line[0]), "growth_lo": float(np.percentile(slopes, 2.5)), "growth_hi": float(np.percentile(slopes, 97.5)),
                "break_lo": int(np.percentile(taus, 2.5)), "break_hi": int(np.percentile(taus, 97.5))})
    return fit


def corpus_tables(cube, corpus, start):
    """Same shapes as the sample estimates in data.json, so the page reads either one."""
    labels = ["All five"] + analyze.TARGETS
    n_all, n_recent = int(cube.n.sum()), int(cube[cube.year >= RECENT].n.sum())
    n_year = cube.groupby("year").n.sum()
    overall, yearly, cross, trends = [], [], [], []
    fielded = cube[cube.field_name.notna()]
    cells = fielded.groupby(["period", "field_name"]).n.sum()
    for label in labels:
        part = named(cube, label)
        hits, hits_recent = int(part.n.sum()), int(part[part.year >= RECENT].n.sum())
        overall.append({"corpus": corpus, "surname": label, "share": hits / n_all, "papers": hits, "hits": hits, "et_al_share": int(part[part.et_al].n.sum()) / n_all,
                        "recent_share": hits_recent / n_recent, "hits_recent": hits_recent, "n_all": n_all, "n_recent": n_recent})
        counts = part.groupby("year").n.sum().reindex(n_year.index, fill_value=0)
        yearly += [{"corpus": corpus, "year": int(y), "surname": label, "hits": int(h), "n": int(n_year[y]), "share": h / n_year[y]} for y, h in counts.items()]
        hit = named(fielded, label).groupby(["period", "field_name"]).n.sum()
        for (period, field), n in cells.items():
            h = int(hit.get((period, field), 0))
            cross.append({"corpus": corpus, "period": period, "field": field, "surname": label, "hits": h, "n": int(n), "share": h / n, "papers": h})
    rng = np.random.default_rng(20261101)
    frame = pd.DataFrame(yearly)
    for label in labels:
        rows = frame[(frame.surname == label) & (frame.year >= start) & (frame.share > 0)]
        p = rows.share.values
        fit = bootstrap_trend(rows.year.values.astype(float), np.log(p / (1 - p)), rng)
        fit.update({"corpus": corpus, "surname": label, "peak_year": int(rows.loc[rows.share.idxmax(), "year"]), "peak_share": float(p.max())})
        trends.append(fit)

    a, b = "2000-2004", "2020-2025"
    decomposition = []
    for label in analyze.TARGETS + ["All five"]:
        values = {}
        for period in (a, b):
            group = cube[cube.period == period]
            known = group[group.china >= 0]
            china, other = known[known.china == 1], known[known.china == 0]
            values[period] = dict(pi=china.n.sum() / known.n.sum(), s_cn=named(china, label).n.sum() / china.n.sum(), s_other=named(other, label).n.sum() / other.n.sum(),
                                  total=named(known, label).n.sum() / known.n.sum(), known=known.n.sum() / group.n.sum())
        A, B = values[a], values[b]
        composition = (B["pi"] - A["pi"]) * (A["s_cn"] - A["s_other"] + B["s_cn"] - B["s_other"]) / 2
        change = B["total"] - A["total"]
        decomposition.append({"corpus": corpus, "surname": label, "known_a": A["known"], "known_b": B["known"], "pi_a": A["pi"], "pi_b": B["pi"], "s_cn_a": A["s_cn"], "s_cn_b": B["s_cn"],
                              "s_other_a": A["s_other"], "s_other_b": B["s_other"], "total_a": A["total"], "total_b": B["total"], "change": change, "china_composition": composition, "within": change - composition})

    by_period = []
    for period in (a, b):
        group = fielded[fielded.period == period]
        table = pd.DataFrame({"mass": group.groupby("field_name").n.sum(), "hit": named(group, "All five").groupby("field_name").n.sum()}).fillna(0)
        by_period.append(pd.DataFrame({"weight": table.mass / table.mass.sum(), "share": table.hit / table.mass}))
    A, B = by_period
    field_shift = {"between_fields": float(((B.weight - A.weight) * (A.share + B.share) / 2).sum()), "within_fields": float(((B.share - A.share) * (A.weight + B.weight) / 2).sum())}

    recent = cube[cube.year >= RECENT]
    top = lambda part: [{"surname": k, "share": float(v / part.n.sum())} for k, v in part[part.surname != "other"].groupby("surname").n.sum().sort_values(ascending=False).head(12).items()]
    china = recent[recent.china == 1]
    aliases = [{"surname": s, "aliases": names, "share": int(recent[recent.surname == s].n.sum()) / n_recent, "alias_share": int(recent[recent.surname.isin(names)].n.sum()) / n_recent} for s, names in analyze.ALIASES.items()]
    validity = {"top5_share": china[china.surname.isin(analyze.TOP5_CHINA)].n.sum() / china.n.sum(), "five_share": china[china.surname.isin(analyze.TARGETS)].n.sum() / china.n.sum()}
    return dict(overall=overall, yearly=yearly, cross=cross, trends=trends, decomposition=decomposition, field_shift=field_shift, top_all=top(cube), top_recent=top(recent), aliases=aliases, validity=validity)


def compare(corpora):
    """Every sample estimate the census replaces, against the census value and the sample's 95% CI."""
    sample = json.loads((analyze.PAGE / "data.json").read_text())["corpora"]
    rows = []
    for corpus, tables in corpora.items():
        old = sample[corpus]
        for s in old["overall"]:
            new = next(r for r in tables["overall"] if r["surname"] == s["surname"])
            rows.append({"corpus": corpus, "kind": "overall", "surname": s["surname"], "key": "", "sample": s["share"], "lo": s["lo"], "hi": s["hi"], "census": new["share"]})
            rows.append({"corpus": corpus, "kind": "recent", "surname": s["surname"], "key": "", "sample": s["recent_share"], "lo": s["recent_lo"], "hi": s["recent_hi"], "census": new["recent_share"]})
        new_year = {(r["surname"], r["year"]): r["share"] for r in tables["yearly"]}
        rows += [{"corpus": corpus, "kind": "yearly", "surname": s["surname"], "key": s["year"], "sample": s["share"], "lo": s["lo"], "hi": s["hi"], "census": new_year[(s["surname"], s["year"])]} for s in old["yearly"]]
        new_cross = {(r["surname"], r["period"], r["field"]): r["share"] for r in tables["cross"]}
        rows += [{"corpus": corpus, "kind": "cross", "surname": s["surname"], "key": f"{s['period']}|{s['field']}", "sample": s["share"], "lo": s["lo"], "hi": s["hi"], "census": new_cross[(s["surname"], s["period"], s["field"])]} for s in old["cross"]]
        for s in old["trends"]:
            new = next(r for r in tables["trends"] if r["surname"] == s["surname"])
            rows.append({"corpus": corpus, "kind": "growth", "surname": s["surname"], "key": "", "sample": s["growth"], "lo": s["growth_lo"], "hi": s["growth_hi"], "census": new["growth"]})
            rows.append({"corpus": corpus, "kind": "break", "surname": s["surname"], "key": "", "sample": s["break_year"], "lo": s["break_lo"], "hi": s["break_hi"], "census": new["break_year"]})
        for s in old["decomposition"]:
            new = next(r for r in tables["decomposition"] if r["surname"] == s["surname"])
            rows += [{"corpus": corpus, "kind": key, "surname": s["surname"], "key": "", "sample": s[key], "lo": None, "hi": None, "census": new[key]} for key in ("pi_a", "pi_b", "total_a", "total_b", "change", "china_composition", "within")]
    frame = pd.DataFrame(rows)
    frame["inside"] = frame.census.between(frame.lo, frame.hi).where(frame.lo.notna())
    return frame


def series(workers):
    paths = sorted(CENSUS.glob("*.parquet"))
    data = json.loads((analyze.PAGE / "data.json").read_text())
    names = sorted(set(analyze.TARGETS) | set(analyze.TOP5_CHINA) | {n for v in analyze.ALIASES.values() for n in v}
                   | {r["surname"] for c in data["corpora"].values() for key in ("top_all", "top_recent") for r in c[key]})
    with ProcessPoolExecutor(workers) as pool:
        parts = list(pool.map(count_cube, paths, repeat(names), chunksize=8))
    cube = pd.concat(parts).groupby(["year", "field", "core", "china", "et_al", "surname"], as_index=False).year_count.sum().rename(columns={"year_count": "n"})
    path = analyze.OUT / "S40_census_cube.csv"
    cube.to_csv(path, index=False)
    analyze.step("S40_census_cube", int(cube.n.sum()), len(cube), path)
    fields = pd.read_csv(analyze.OUT / "S1_strata.csv").drop_duplicates("field_id").set_index("field_id").field
    cube["field_name"] = cube.field.map(fields)
    cube["period"] = cube.year.map(lambda y: analyze.PERIODS[min((y - FIRST_YEAR) // 5, 9)])
    corpora = {"all": corpus_tables(cube, "all", 1975), "core": corpus_tables(cube[cube.core], "core", 1985)}
    path = analyze.OUT / "S41_census_vs_sample.csv"
    comparison = compare(corpora)
    comparison.to_csv(path, index=False)
    analyze.step("S41_census_vs_sample", len(comparison), int(comparison.inside.eq(True).sum()), path)
    page = analyze.PAGE / "census.json"
    census = json.loads(page.read_text())
    census["corpora"] = corpora
    page.write_text(json.dumps(census, ensure_ascii=False, separators=(",", ":"), allow_nan=False, default=float))
    analyze.step("S42_census_page", len(corpora["all"]["cross"]) + len(corpora["core"]["cross"]), len(corpora["all"]["yearly"]) + len(corpora["core"]["yearly"]), page)
    print(comparison.groupby(["corpus", "kind"]).inside.agg(["size", "count", "sum"]).to_string())
    for corpus, tables in corpora.items():
        print(pd.DataFrame(tables["trends"])[["surname", "growth", "growth_lo", "growth_hi", "break_year", "break_lo", "break_hi", "slope_before", "slope_after", "sse_ratio", "peak_year"]].round(4).to_string())
        print(pd.DataFrame(tables["decomposition"])[["surname", "known_a", "known_b", "pi_a", "pi_b", "s_cn_a", "s_cn_b", "s_other_a", "s_other_b", "total_a", "total_b", "change", "china_composition", "within"]].round(4).to_string())
        print(tables["field_shift"], tables["validity"], tables["aliases"], tables["top_recent"][:5], sep="\n")


if __name__ == "__main__":
    args = sys.argv[1:]
    limit = int(args[args.index("--limit") + 1]) if "--limit" in args else 0
    workers = int(args[args.index("--workers") + 1]) if "--workers" in args else 12
    command = args[0] if args else "extract"
    if command == "tabulate":
        tabulate(workers)
    elif command == "series":
        series(workers)
    else:
        extract(limit, workers)
