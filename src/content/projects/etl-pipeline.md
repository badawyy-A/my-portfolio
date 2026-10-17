---
title: MongoDB to PostgreSQL ETL pipeline
summary: Move data from MongoDB into PostgreSQL through three layers, segment customers, and show it on a dashboard.
order: 5
scene: etl
stack: [PySpark, Airflow, PostgreSQL, scikit-learn, FastAPI, React]
layers:
  - name: Model
    items: [scikit-learn K-Means]
  - name: Pipeline
    items: [Python, PySpark or pandas, SQLAlchemy, Airflow]
  - name: Backend
    items: [FastAPI]
  - name: Database
    items: [MongoDB source, PostgreSQL warehouse]
  - name: Frontend
    items: [React, Recharts]
flow:
  - MongoDB
  - L1 Raw
  - L2 Cleaned
  - L3 Business
  - Segmentation
  - Dashboard
---

## Problem

Operational data in MongoDB is nested and inconsistent, which makes it hard to report on. It needs to become clean, structured data that is ready for analytics.

## Features

**L1 Raw.** A full load first, then incremental loads using timestamps or change streams. Data is stored as JSONB with load metadata (batch ID, load time, source collection) and never changed, so any later layer can be rebuilt from it.

**L2 Cleaned.**

- Nested documents flattened, arrays split into child tables.
- Type casting, deduplication and null handling.
- Validation rules, with bad records sent to quarantine.
- Standardization and schema drift handling.
- Upserts, so reruns are safe.

**L3 Business.** A star schema with fact and dimension tables, SCD Type 2 history on dimensions, enrichment, derived columns, and daily, weekly and monthly aggregates.

**Segmentation.** Runs after L3.

- Features from L3: RFM, average order value, categories, activity trend.
- K-Means assigns each customer a segment.
- Scheduled retraining with model versioning.
- Segments, segment history and aggregates written back to PostgreSQL.
- An alert if segment sizes shift suddenly.

**Orchestration.** One Airflow DAG runs L1, L2, L3 and segmentation in order, with retries, failure alerts, a run log and quality checks at each stage.

**Dashboard.** KPIs and trends with filters, segment sizes and profiles, segment movement over time, and a pipeline health page.

## How it works

Data moves from MongoDB through the three layers, each one stricter than the last. Segmentation reads the business layer and writes its results back, and the dashboard reads from PostgreSQL.
