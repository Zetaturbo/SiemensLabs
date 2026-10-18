-- Lets the run_sql fallback tool read supplier offerings and profiles (migration 004), so the
-- chatbot can answer product questions (price, MOQ, lead time, capacity, certifications) with
-- SQL. Same read-only role as migration 003; join to `suppliers` on supplier_id for scores.
--
-- To apply to a database created before this migration existed:
--     docker exec -i siemenslabs-db psql -U siemens -d siemenslabs < db/migrations/005_run_sql_brakes.sql

create or replace view chat.supplier_offerings as
select offering_id, supplier_id, commodity, product_type, application, material, copper_free,
       unit_price_eur, moq_units, lead_time_days, annual_capacity_units
from public.supplier_offerings;

create or replace view chat.supplier_profiles as
select supplier_id, country, region, supplier_status, certifications
from public.supplier_profiles;

grant select on chat.supplier_offerings, chat.supplier_profiles to supplier_reader;
