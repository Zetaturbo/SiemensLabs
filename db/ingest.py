"""Load the mock supplier risk data into the local Postgres database.

Loads three things:
  1. metric_definitions, parsed from the criteria markdown
  2. suppliers, with operational metrics
  3. supplier_scores, one row per supplier and risk metric

Safe to re-run: rows are upserted.

Usage:
    uv run --with "psycopg[binary]" db/ingest.py \
        --csv data/eval/source/supplier_risk_data.csv \
        --criteria data/eval/source/supplier_risk_criteria.md

Connection is read from DATABASE_URL (see .env.example).
"""

import argparse
import csv
import os
import re
from pathlib import Path

import psycopg

DEFAULT_URL = "postgresql://siemens:siemens@localhost:5433/siemenslabs"
SOURCE_NAME = "mock_supplier_risk_v1"

# CSV column -> (suppliers column, unit)
OPERATIONAL_FIELDS = {
    "Purchase Order Volume (EUR)": ("po_volume_eur", "eur"),
    "Order Change Rate": ("order_change_rate", "percent"),
    "Supplier Delivery Rating": ("delivery_rating", "percent"),
    "Order Confirmation Rate": ("confirmation_rate", "percent"),
    "Sourcing Risk Level": ("sourcing_risk_level", "category"),
    "Supply Chain Complexity": ("supply_chain_complexity", "category"),
}

# Operational metrics where a higher value means more risk; None = not ordinal
OPERATIONAL_HIGHER_IS_WORSE = {
    "Purchase Order Volume (EUR)": True,
    "Order Change Rate": True,
    "Supplier Delivery Rating": False,
    "Order Confirmation Rate": False,
    "Sourcing Risk Level": True,
    "Supply Chain Complexity": True,
}


def parse_criteria(path):
    """Return {metric_key: (display_name, category, description)} from the markdown."""
    definitions = {}
    category = None
    current = None
    for line in Path(path).read_text().splitlines():
        if line.startswith("## "):
            category = "risk_score" if "Risk" in line else "operational"
            current = None
            continue
        match = re.match(r"- \*\*(.+?):\*\*\s*(.*)", line)
        if match:
            key, description = match.groups()
            display = key.replace("_", " ")
            definitions[key] = [display, category, description.strip()]
            current = key
        elif current and line.strip().startswith("- "):
            # Sub-bullets (e.g. ESG pillars) are appended to the parent description
            definitions[current][2] += " " + line.strip()[2:]
    return definitions


def to_number(value):
    return float(value) if value != "" else None


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--csv", default="data/eval/source/supplier_risk_data.csv")
    parser.add_argument("--criteria", default="data/eval/source/supplier_risk_criteria.md")
    args = parser.parse_args()

    definitions = parse_criteria(args.criteria)
    with open(args.csv, newline="") as f:
        rows = list(csv.DictReader(f))
    score_fields = [c for c in rows[0] if c.endswith("_Score") or c == "Total_Risk_Index"]

    missing = [c for c in score_fields + list(OPERATIONAL_FIELDS) if c not in definitions]
    if missing:
        raise SystemExit(f"Columns without a definition in {args.criteria}: {missing}")

    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_URL)) as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into sources (name, kind, description, file_path)
            values (%s, 'csv', 'Simulated supplier risk scores for 10k suppliers', %s)
            on conflict (name) do update set file_path = excluded.file_path
            returning source_id
            """,
            (SOURCE_NAME, args.csv),
        )
        source_id = cur.fetchone()[0]

        metric_rows = []
        for key in score_fields:
            display, category, description = definitions[key]
            metric_rows.append((key, display, category, description, "score_0_100", True, source_id))
        for key, (_, unit) in OPERATIONAL_FIELDS.items():
            display, category, description = definitions[key]
            metric_rows.append(
                (key, display, category, description, unit, OPERATIONAL_HIGHER_IS_WORSE[key], source_id)
            )
        cur.executemany(
            """
            insert into metric_definitions
                (metric_key, display_name, category, description, unit, higher_is_worse, source_id)
            values (%s, %s, %s, %s, %s, %s, %s)
            on conflict (metric_key) do update set
                display_name = excluded.display_name,
                category = excluded.category,
                description = excluded.description,
                unit = excluded.unit,
                higher_is_worse = excluded.higher_is_worse
            """,
            metric_rows,
        )

        cur.executemany(
            """
            insert into suppliers
                (supplier_id, name, po_volume_eur, order_change_rate, delivery_rating,
                 confirmation_rate, sourcing_risk_level, supply_chain_complexity, source_id)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (supplier_id) do update set
                name = excluded.name,
                po_volume_eur = excluded.po_volume_eur,
                order_change_rate = excluded.order_change_rate,
                delivery_rating = excluded.delivery_rating,
                confirmation_rate = excluded.confirmation_rate,
                sourcing_risk_level = excluded.sourcing_risk_level,
                supply_chain_complexity = excluded.supply_chain_complexity,
                updated_at = now()
            """,
            [
                (
                    r["supplierID"],
                    r["Supplier Name"],
                    to_number(r["Purchase Order Volume (EUR)"]),
                    to_number(r["Order Change Rate"]),
                    to_number(r["Supplier Delivery Rating"]),
                    to_number(r["Order Confirmation Rate"]),
                    r["Sourcing Risk Level"],
                    r["Supply Chain Complexity"],
                    source_id,
                )
                for r in rows
            ],
        )

        # Replace this source's scores for today rather than upserting 190k rows
        cur.execute(
            "delete from supplier_scores where source_id = %s and as_of = current_date", (source_id,)
        )
        with cur.copy(
            "copy supplier_scores (supplier_id, metric_key, score, level, source_id) from stdin"
        ) as copy:
            for r in rows:
                for key in score_fields:
                    copy.write_row((r["supplierID"], key, int(r[key]), r[f"{key}_Level"], source_id))

        cur.execute("select count(*) from suppliers")
        n_suppliers = cur.fetchone()[0]
        cur.execute("select count(*) from supplier_scores where source_id = %s", (source_id,))
        n_scores = cur.fetchone()[0]

    print(f"metric_definitions: {len(metric_rows)}, suppliers: {n_suppliers}, scores: {n_scores}")


if __name__ == "__main__":
    main()
