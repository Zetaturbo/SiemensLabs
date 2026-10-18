-- Read-only login for the run_sql fallback tool (docs/ARCHITECTURE.md 5.11).
--
-- run_sql executes SQL written by the chatbot, so it must not run as the
-- owner or a superuser: those can reset roles, read server files or write.
-- This role can only SELECT from chat.suppliers, which exposes supplier_wide
-- under the contract field names (so `select ... from suppliers` works).
--
-- The password is for the local Docker database only. Set a real one (and
-- RUN_SQL_DATABASE_URL in the service) for any shared or hosted database.

create schema if not exists chat;

create or replace view chat.suppliers as
select * from public.supplier_wide;

do $$
begin
    if not exists (select from pg_roles where rolname = 'supplier_reader') then
        create role supplier_reader login password 'supplier_reader';
    end if;
end
$$;

alter role supplier_reader set search_path = chat;
alter role supplier_reader set statement_timeout = '5s';
alter role supplier_reader set default_transaction_read_only = on;

grant usage on schema chat to supplier_reader;
grant select on chat.suppliers to supplier_reader;
