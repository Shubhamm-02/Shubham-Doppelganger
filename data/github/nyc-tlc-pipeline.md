# nyc-tlc-pipeline

- GitHub: https://github.com/Shubhamm-02/nyc-tlc-pipeline
- Created: 2026-09-23
- Last pushed: 2026-09-23
- Languages: Python
- Topics: None
- Description: FDE Data Foundations project focused on turning fragmented operational data into a trustworthy, repeatable pipeline. Covers data retrieval, profiling, validation, workflow modelling, business KPIs, and dependable pipeline execution with explicit assumptions and failure handling.

## README

# NYC TLC — from messy trip data to a dependable KPI pipeline

**FDE Data Foundations Assignment · Track B (NYC TLC).** A small, explainable,
repeatable pipeline that turns raw NYC yellow-taxi trip files into trustworthy
monthly operational metrics.

> The goal is not "I analysed a dataset." It is **"I built a trustworthy path from
> client systems to a business decision."**

---

## 1. Problem & stakeholders

A yellow-taxi **fleet operator's Operations & Revenue team** needs a dependable
monthly view of trip health. Today the raw TLC files are large, messy, and use
opaque zone codes, so nobody trusts a quick average. Leadership keeps asking two
questions and can't answer them defensibly:

| Stakeholder | What they need from the output |
|---|---|
| **Operations lead** | Where and when is demand? Where should drivers be repositioned? |
| **Revenue analyst** | What does a trip earn, how much is tips, is revenue leaking? |
| **Data owner** | Can we trust this month's numbers, and how much data did we drop and why? |

**Decision the output supports:** (1) **where to reposition drivers** (zone / airport
demand) and (2) **when to investigate** a metric that moved for the wrong reason
(data quality vs. real operational change).

## 2. Project KPI + metrics

**KPI — Avg revenue per trip ($).** Four supporting metrics decompose it, plus a
data-trust metric that headlines everything. Full definitions: docs/metrics_definitions.md.

### Final evidence table (committed 75k sample, Jan 2024)

Built from **75,000** raw rows → **68,227** analysis-ready trips (**91.0% valid**). Gate: **PASS**.

| Metric | Value | Unit | Role |
|---|---|---|---|
| **Avg revenue per trip** | **27.09** | $ | **KPI** |
| Avg trip distance | 3.24 | mi | supporting |
| Avg trip duration | 14.95 | min | supporting |
| Avg speed | 11.39 | mph | supporting |
| Tip rate (card trips) | 22.69 | % | supporting |
| Airport trip share | 9.97 | % | supporting |

*Full-month run (2.96M rows) gives $27.00 / 3.22 mi / 14.91 min / 11.36 mph / 22.72% /
9.83% — the sample is representative.* Regenerated file: data/output/evidence_table.md.

## 3. Sources & retrieval (2 modes, raw preserved)

| Source | Retrieval mode | What it provides | Completeness check |
|---|---|---|---|
| TLC Yellow Taxi trip records (Parquet) | **Files** (HTTPS) | the trip fact (~3M rows/mo) | bytes == HTTP `Content-Length` |
| NYC Taxi Zones (Socrata REST API) | **API** | zone/borough dimension | retrieved count == dataset `count(*)` |
| DuckDB over the ingested data | **SQL** | staging, validation, model, metrics | — |

Details, ownership, grain and gaps: docs/source_map.md.
Raw inputs are preserved untouched in `data/raw/` and `data/reference/`.

## 4. Workflow & data model

Trip event → validated fact ⋈ zone dimension → metrics. Diagrams (Mermaid):
docs/data_model.md.

## 5. Validation (flag, don't silently fix)

13 business rules produce `trips_flagged` with a per-rule verdict and an overall
`is_valid`; nothing is dropped, invalid rows are **quarantined** and counted. See
the generated data/output/validation_report.md
and a sample of quarantined rows in `data/output/invalid_samples.csv`.
Assumptions/limitations: docs/known_unknown_assumptions_limitations.md.

## 6. Pipeline dependability

- **Repeatable:** `ingest → validate → transform → metrics`, one command.
- **Deterministic reruns:** staging DB rebuilt each run; raw inputs reused unless
  `--force`; same inputs + same config ⇒ identical output.
- **Logging:** console + `logs/pipeline_<run_id>.log`.
- **Validation gate:** run exits non-zero if any *hard* rule's failure share is
  implausibly high (a wrong/corrupt file), so bad data can't silently ship.
- **Failure handling:** each stage is guarded; a machine-readable
  `data/output/run_manifest.json` records row counts, timings, gate result, and KPI.
- **Tested:** `tests/test_validation.py` checks the rules against known-bad rows.

---

## Setup & run

```bash
# 1. create env + install deps
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 2a. run OFFLINE on the committed 75k sample (reproduces data/output exactly)
python run_pipeline.py --sample

# 2b. or run the FULL month (downloads ~50MB Parquet, verified)
python run_pipeline.py

# other options
python run_pipeline.py --month 2024-02        # a different month
python run_pipeline.py --force                 # re-fetch raw inputs
python -m pytest -q                            # run the validation tests
```

Outputs land in `data/output/`: `metrics_by_month.csv`, `evidence_table.md`,
`validation_report.{csv,md}`, `profile.csv`, `top_pickup_zones.csv`,
`invalid_samples.csv`, `run_manifest.json`.

## Repository layout

```
config.yaml              # months + business thresholds (single source of truth)
run_pipeline.py          # orchestrator: ingest → validate → transform → metrics
src/                     # ingest.py  validate.py  transform.py  metrics.py  (+ config/logging/utils)
sql/                     # 01_stage → 02_validate → 03_model → 04_metrics
data/raw/sample/         # committed 75k-row sample (offline reproducibility)
data/reference/          # zone lookup fetched from the API (raw JSON + CSV)
data/output/             # generated metrics, evidence table, validation report, manifest
docs/                    # source_map, data_model, metric definitions, KUAL, demo script
tests/                   # validation unit tests
tools/make_sample.py     # regenerates the committed sample from a full month
```

## Demo
3–5 min walkthrough script (one key FDE judgement call): docs/demo_script.md.
