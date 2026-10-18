"""Postgres connection pool. Connection string from DATABASE_URL (see .env.example)."""

import os

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DEFAULT_URL = "postgresql://siemens:siemens@localhost:5433/siemenslabs"

_pool: ConnectionPool | None = None


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
