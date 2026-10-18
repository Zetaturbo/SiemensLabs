"""Load the simulated brake supplier dataset into the local Postgres database.

Opt-in: run after db/ingest.py (metric definitions must exist) and after
migration 004. Loads the brake suppliers into suppliers and supplier_scores
under their own source, plus supplier_profiles and supplier_offerings.

Note: brake suppliers then also appear in supplier_wide, so portfolio-wide
answers (counts, rankings, dataset stats) no longer match the 10k-supplier
eval set and API mocks. Remove them with --remove.

Safe to re-run: rows are upserted.

Usage:
    uv run --with "psycopg[binary]" db/ingest_brakes.py
    uv run --with "psycopg[binary]" db/ingest_brakes.py --remove

Connection is read from DATABASE_URL (see .env.example).
"""

import argparse
import csv
import os
from pathlib import Path

import psycopg

DEFAULT_URL = "postgresql://siemens:siemens@localhost:5433/siemenslabs"
SOURCE_NAME = "mock_brake_suppliers_v1"


def to_number(value):
    return float(value) if value != "" else None


def remove(cur):
    cur.execute("select source_id from sources where name = %s", (SOURCE_NAME,))
    row = cur.fetchone()
    if not row:
        print("Nothing to remove")
        return
    # Cascades to supplier_scores, supplier_profiles and supplier_offerings
    cur.execute("delete from suppliers where source_id = %s", (row[0],))
    print(f"Removed {cur.rowcount} brake suppliers")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--source", default="data/brakes/source")
    parser.add_argument("--remove", action="store_true", help="delete the brake suppliers instead of loading")
    args = parser.parse_args()

    with psycopg.connect(os.environ.get("DATABASE_URL", DEFAULT_URL)) as conn, conn.cursor() as cur:
        if args.remove:
            remove(cur)
            cur.execute("refresh materialized view supplier_wide")
            return

        src = Path(args.source)
        with open(src / "brake_suppliers.csv", newline="") as f:
            suppliers = list(csv.DictReader(f))
        with open(src / "brake_offerings.csv", newline="") as f:
            offerings = list(csv.DictReader(f))
        score_fields = [c for c in suppliers[0] if c.endswith("_Score") or c == "Total_Risk_Index"]

        cur.execute("select metric_key from metric_definitions")
        missing = set(score_fields) - {r[0] for r in cur.fetchall()}
        if missing:
            raise SystemExit(f"Run db/ingest.py first; metric definitions missing: {sorted(missing)}")

        cur.execute(
            """
            insert into sources (name, kind, description, file_path)
            values (%s, 'csv', 'Simulated brake suppliers with offerings', %s)
            on conflict (name) do update set file_path = excluded.file_path
            returning source_id
            """,
            (SOURCE_NAME, str(src)),
        )
        source_id = cur.fetchone()[0]

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
                    r["supplierID"], r["Supplier Name"],
                    to_number(r["Purchase Order Volume (EUR)"]), to_number(r["Order Change Rate"]),
                    to_number(r["Supplier Delivery Rating"]), to_number(r["Order Confirmation Rate"]),
                    r["Sourcing Risk Level"], r["Supply Chain Complexity"], source_id,
                )
                for r in suppliers
            ],
        )

        cur.execute(
            "delete from supplier_scores where source_id = %s and as_of = current_date", (source_id,)
        )
        with cur.copy(
            "copy supplier_scores (supplier_id, metric_key, score, level, source_id) from stdin"
        ) as copy:
            for r in suppliers:
                for key in score_fields:
                    copy.write_row((r["supplierID"], key, int(r[key]), r[f"{key}_Level"], source_id))

        cur.executemany(
            """
            insert into supplier_profiles
                (supplier_id, country, region, supplier_status, certifications, source_id)
            values (%s, %s, %s, %s, %s, %s)
            on conflict (supplier_id) do update set
                country = excluded.country,
                region = excluded.region,
                supplier_status = excluded.supplier_status,
                certifications = excluded.certifications
            """,
            [
                (r["supplierID"], r["Country"], r["Region"], r["Supplier Status"],
                 [c for c in r["Certifications"].split("; ") if c], source_id)
                for r in suppliers
            ],
        )

        cur.executemany(
            """
            insert into supplier_offerings
                (offering_id, supplier_id, commodity, product_type, application, material, copper_free,
                 unit_price_eur, moq_units, lead_time_days, annual_capacity_units, source_id)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
            on conflict (offering_id) do update set
                product_type = excluded.product_type,
                application = excluded.application,
                material = excluded.material,
                copper_free = excluded.copper_free,
                unit_price_eur = excluded.unit_price_eur,
                moq_units = excluded.moq_units,
                lead_time_days = excluded.lead_time_days,
                annual_capacity_units = excluded.annual_capacity_units
            """,
            [
                (
                    o["offeringID"], o["supplierID"], o["Commodity"], o["Product Type"], o["Application"],
                    o["Material"] or None, {"Yes": True, "No": False}.get(o["Copper Free"]),
                    float(o["Unit Price (EUR)"]), int(o["MOQ (units)"]), int(o["Lead Time (days)"]),
                    int(o["Annual Capacity (units)"]), source_id,
                )
                for o in offerings
            ],
        )

        cur.execute("refresh materialized view supplier_wide")

    print(f"brake suppliers: {len(suppliers)}, offerings: {len(offerings)}")


if __name__ == "__main__":
    main()
