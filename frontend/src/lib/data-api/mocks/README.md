# Data API mocks

One JSON file per tool, named exactly like the tool (`get_metadata.json`, `filter_suppliers.json`, ...),
each holding a full response envelope with real values from the dataset. The data owner commits these
on day one (ARCHITECTURE.md section 8). Until then, add your own here to unblock UI work.

Served when `DATA_API_MOCK=1`.
