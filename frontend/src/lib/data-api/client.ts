import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DataTool, Envelope } from "./types";

const MOCK = process.env.DATA_API_MOCK === "1";
const BASE = process.env.DATA_API_URL ?? "http://localhost:8000";

/**
 * One entry point for every data tool. With DATA_API_MOCK=1 it serves
 * src/lib/data-api/mocks/<tool>.json (the data owner commits one real-valued
 * response per tool); otherwise it POSTs to the data service.
 */
export async function callDataTool<T = unknown>(tool: DataTool, input: Record<string, unknown> = {}): Promise<Envelope<T>> {
  if (MOCK) {
    const file = path.join(process.cwd(), "src/lib/data-api/mocks", `${tool}.json`);
    try {
      return JSON.parse(await readFile(file, "utf8")) as Envelope<T>;
    } catch {
      return { ok: false, data: null, meta: {}, error: { code: "INTERNAL", message: `No mock for ${tool} at ${file}` } };
    }
  }
  const res = await fetch(`${BASE}/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
  });
  return (await res.json()) as Envelope<T>;
}
