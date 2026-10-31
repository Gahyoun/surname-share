# Surname share

How common is "Zhang et al."? This page estimates the share of papers whose first author is named Zhang, Chen, Wang, Guo or Liu, by field and over time, how much faster they grew than all papers, from stratified [OpenAlex](https://openalex.org) samples.

The page is in `docs/`. To regenerate its data:

```bash
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --snapshots
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --pooled
OPENALEX_MAILTO=you@example.org python scripts/surname_share_collect.py --fields
python scripts/surname_share_analyze.py
python scripts/surname_share_distribution.py
python scripts/surname_share_retest.py
python scripts/surname_share_fields.py
python scripts/surname_share_common.py
python scripts/surname_share_others.py
python scripts/surname_share_validity.py
```

The analysis needs `numpy`, `pandas` and `scipy`. Raw samples are written to `data/`, which is not committed. Results are a snapshot from 2026-10-31.
