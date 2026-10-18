"""Response envelope, error type and number formatting shared by all tools (ARCHITECTURE.md section 5)."""

import math
from decimal import Decimal


class ToolError(Exception):
    """A failure reported to the caller as {ok: false, error: {code, message}}."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def ok(data, **meta) -> dict:
    return {"ok": True, "data": data, "meta": meta, "error": None}


def fail(code: str, message: str) -> dict:
    return {"ok": False, "data": None, "meta": {}, "error": {"code": code, "message": message}}


def num(x, nd: int = 2):
    """JSON-safe number: floats rounded to nd decimals, whole numbers emitted as int (41, not 41.0)."""
    if x is None:
        return None
    if isinstance(x, bool):
        return x
    if isinstance(x, int):
        return x
    v = round(float(x) if isinstance(x, Decimal) else x, nd)
    if math.isnan(v):
        return None
    if v == 0:
        return 0
    return int(v) if v.is_integer() else v


def record(row: dict, fields) -> dict:
    return {f: row[f] if isinstance(row[f], str) else num(row[f]) for f in fields}
