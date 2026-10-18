"""Postgres connection pool. Connection string from DATABASE_URL (see .env.example)."""

import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DEFAULT_URL = "postgresql://siemens:siemens@localhost:5433/siemenslabs"
# Restricted login for run_sql (db/migrations/003_run_sql_reader.sql); local Docker default
DEFAULT_READER_URL = "postgresql://supplier_reader:supplier_reader@localhost:5433/siemenslabs"

_pool: ConnectionPool | None = None
_reader_pool: ConnectionPool | None = None


def _configure(conn):
    # The tools only read; this blocks writes even if a query builder has a bug
    conn.read_only = True
    conn.autocommit = True


def pool() -> ConnectionPool:
    global _pool
    if _pool is None:
        _pool = ConnectionPool(
            os.environ.get("DATABASE_URL", DEFAULT_URL),
            kwargs={"row_factory": dict_row},
            configure=_configure,
            min_size=1,
            max_size=5,
            open=True,
        )
    return _pool


def reader_pool() -> ConnectionPool:
    """Connections for run_sql, as the read-only supplier_reader role. Rows come back as tuples."""
    global _reader_pool
    if _reader_pool is None:
        _reader_pool = ConnectionPool(
            os.environ.get("RUN_SQL_DATABASE_URL", DEFAULT_READER_URL),
            configure=_configure,
            min_size=0,
            max_size=2,
            open=True,
        )
    return _reader_pool
