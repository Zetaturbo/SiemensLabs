-- Supplier profile and product offerings, used by the simulated brake supplier dataset
-- (data/brakes). Empty unless db/ingest_brakes.py is run.
--
-- To apply to a database created before this migration existed:
--     docker exec -i siemenslabs-db psql -U siemens -d siemenslabs < db/migrations/003_supplier_offerings.sql

-- One row per supplier: where it is, whether it is approved, which certificates it holds
create table supplier_profiles (
    supplier_id      text primary key references suppliers (supplier_id) on delete cascade,
    country          text not null,
    region           text not null,
    supplier_status  text not null check (supplier_status in ('Approved', 'Prospect')),
    certifications   text[] not null default '{}',
    source_id        bigint references sources (source_id)
);

-- One row per product a supplier quotes, with the commercial terms of the quote
create table supplier_offerings (
    offering_id            text primary key,          -- e.g. BRK_0001-01
    supplier_id            text not null references suppliers (supplier_id) on delete cascade,
    commodity              text not null,             -- e.g. Brakes
    product_type           text not null,             -- e.g. Disc brake pads
    application            text not null,             -- e.g. Passenger car, Rail
    material               text,
    copper_free            boolean,                   -- null where not a friction product
    unit_price_eur         numeric(12, 2) not null,
    moq_units              integer not null,
    lead_time_days         integer not null,
    annual_capacity_units  integer not null,
    source_id              bigint references sources (source_id)
);

create index supplier_offerings_product_idx on supplier_offerings (commodity, product_type);
create index supplier_offerings_supplier_idx on supplier_offerings (supplier_id);
