"""Response envelope and error type shared by all tools (same shape as the data service, ARCHITECTURE.md section 5)."""


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
