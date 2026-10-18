"""Turn tool inputs (filter conditions, sort keys, field lists) into safe, parameterized SQL.

Field names are checked against the catalog and quoted as identifiers; values are always bound
parameters. Level and category fields compare by their ordinal order (Low < Medium < High < Critical)
for lt, lte, gt, gte and between, and sort the same way.
"""

from decimal import Decimal

from psycopg import sql

from .catalog import ALL_FIELDS, NUMERIC_FIELDS, ORDINALS, TEXT_FIELDS
from .envelope import ToolError

OPS = {"eq", "ne", "lt", "lte", "gt", "gte", "in", "not_in", "between"}
RANGE_OPS = {"lt": "<", "lte": "<=", "gt": ">", "gte": ">="}


def check_fields(fields, allowed=ALL_FIELDS) -> list[str]:
    if not isinstance(fields, list) or not all(isinstance(f, str) for f in fields):
        raise ToolError("INVALID_FILTER", "fields must be a list of field names")
    unknown = [f for f in fields if f not in allowed]
    if unknown:
        raise ToolError("UNKNOWN_FIELD", f"Unknown field(s): {', '.join(unknown)}")
    return fields


def columns(fields) -> sql.Composable:
    return sql.SQL(", ").join(map(sql.Identifier, fields))


def _ordinal(field: str) -> sql.Composable:
    return sql.SQL("array_position({}::text[], {})").format(sql.Literal(ORDINALS[field]), sql.Identifier(field))


def _value(field: str, v):
    """Validate one condition value against the field type and convert it for binding."""
    if field in ORDINALS:
        if v not in ORDINALS[field]:
            raise ToolError("INVALID_FILTER", f"{field} must be one of {ORDINALS[field]}, got {v!r}")
        return v
    if field in NUMERIC_FIELDS:
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            raise ToolError("INVALID_FILTER", f"{field} needs a number, got {v!r}")
        return Decimal(str(v))
    if not isinstance(v, str):
        raise ToolError("INVALID_FILTER", f"{field} needs a string, got {v!r}")
    return v


def where_clause(conditions, extra=()) -> tuple[sql.Composable, list]:
    """AND-combine filter conditions, plus any extra (SQL, params) pairs the tool adds itself.
    Returns (WHERE clause or empty SQL, parameters)."""
    if conditions is None:
        conditions = []
    if not isinstance(conditions, list):
        raise ToolError("INVALID_FILTER", "conditions must be a list")
    parts, params = [], []
    for c in conditions:
        if not isinstance(c, dict) or not {"field", "op", "value"} <= c.keys():
            raise ToolError("INVALID_FILTER", f"Each condition needs field, op and value: {c!r}")
        field, op, value = c["field"], c["op"], c["value"]
        if field not in ALL_FIELDS:
            raise ToolError("UNKNOWN_FIELD", f"Unknown field: {field}")
        if op not in OPS:
            raise ToolError("INVALID_FILTER", f"Unknown op {op!r}; use one of {sorted(OPS)}")
        col = sql.Identifier(field)

        if op in ("eq", "ne"):
            parts.append(sql.SQL("{} = %s" if op == "eq" else "{} <> %s").format(col))
            params.append(_value(field, value))
        elif op in ("in", "not_in"):
            if not isinstance(value, list) or not value:
                raise ToolError("INVALID_FILTER", f"{op} needs a non-empty list for {field}")
            parts.append(sql.SQL("{} = any(%s)" if op == "in" else "not ({} = any(%s))").format(col))
            params.append([_value(field, v) for v in value])
        else:
            if field in TEXT_FIELDS:
                raise ToolError("INVALID_FILTER", f"{op} is not supported for {field}")
            values = value if op == "between" else [value]
            if op == "between" and (not isinstance(value, list) or len(value) != 2):
                raise ToolError("INVALID_FILTER", f"between needs [low, high] for {field}")
            values = [_value(field, v) for v in values]
            lhs = col
            if field in ORDINALS:
                lhs = _ordinal(field)
                values = [ORDINALS[field].index(v) + 1 for v in values]
            if op == "between":
                parts.append(sql.SQL("{} between %s and %s").format(lhs))
            else:
                parts.append(sql.SQL("{} {} %s").format(lhs, sql.SQL(RANGE_OPS[op])))
            params.extend(values)

    for part, part_params in extra:
        parts.append(part)
        params.extend(part_params)
    if not parts:
        return sql.SQL(""), params
    return sql.SQL("where ") + sql.SQL(" and ").join(parts), params


def order_clause(sort_by) -> sql.Composable:
    """ORDER BY the requested keys, then supplier_id so results are deterministic."""
    if sort_by is None:
        sort_by = []
    if not isinstance(sort_by, list):
        raise ToolError("INVALID_FILTER", "sort_by must be a list")
    keys = []
    for s in sort_by:
        if not isinstance(s, dict) or "field" not in s:
            raise ToolError("INVALID_FILTER", f"Each sort key needs a field: {s!r}")
        field, order = s["field"], s.get("order", "asc")
        if field not in ALL_FIELDS:
            raise ToolError("UNKNOWN_FIELD", f"Unknown sort field: {field}")
        if order not in ("asc", "desc"):
            raise ToolError("INVALID_FILTER", f"order must be asc or desc, got {order!r}")
        expr = _ordinal(field) if field in ORDINALS else sql.Identifier(field)
        keys.append(expr + sql.SQL(" " + order))
    keys.append(sql.SQL("supplier_id asc"))
    return sql.SQL("order by ") + sql.SQL(", ").join(keys)
