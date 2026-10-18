/**
 * pnpm check:data  -  calls every data tool once through callDataTool and prints tool, source, ok.
 *
 *   pnpm check:data                                              # DATA_API_URL / DATA_API_MOCK from frontend/.env
 *   DATA_API_MOCK=0 DATA_API_URL=http://localhost:8000 pnpm check:data
 *
 * Inputs are the ones each static mock answers (meta.mock_input in src/lib/data-api/mocks/<tool>.json), so a
 * live, engine and mock answer can be compared for the same call. Exits 1 when any tool returns ok: false,
 * except NOT_AVAILABLE (run_sql without the live service), which is printed as "not available".
 * A second pass runs every tool on the brakes dataset (dataset: "brakes", BRK_ inputs) and the brake row
 * loader of the RFQ skills (live run_sql on the service views, else the CSVs).
 * Fallback log lines ([data-api] tool: live -> engine (...)) go to stderr.
 */
import Module from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../../..");

// Next.js resolves "server-only" itself; in plain Node it is not installed, so point it at the eval's no-op shim.
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(root, "evals/routing/server-only-shim.cjs");
  return resolveFilename.call(this, request, ...rest);
};

process.chdir(root); // mocks and the engine resolve paths from process.cwd()
// Values already in the environment win over .env (process.loadEnvFile does not overwrite them).
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

const TOOLS = [
  "get_metadata",
  "list_profiles",
  "get_suppliers",
  "filter_suppliers",
  "compare_suppliers",
  "rank_with_profile",
  "explain_supplier",
  "find_similar",
  "kraljic_position",
  "get_dataset_stats",
  "run_sql",
] as const;

/** Brakes pass: one input per tool on the brake rows (RFQ-02 suppliers). */
const BRAKE_INPUTS: Record<(typeof TOOLS)[number], Record<string, unknown>> = {
  get_metadata: {},
  list_profiles: {},
  get_suppliers: { ids: ["BRK_0046", "BRK_0058"] },
  filter_suppliers: { conditions: [{ field: "certifications", op: "contains", value: "ISO/TS 22163" }], limit: 20 },
  compare_suppliers: { ids: ["BRK_0030", "BRK_0046", "BRK_0058"], fields: null, profile_id: "default" },
  rank_with_profile: { ids: ["BRK_0030", "BRK_0046", "BRK_0049", "BRK_0058"], profile_id: "safety_critical" },
  explain_supplier: { id: "BRK_0046", profile_id: "default" },
  find_similar: { id: "BRK_0046", must_be_lower: ["external_intelligence"], conditions: [], limit: 5 },
  kraljic_position: { ids: ["BRK_0046"] },
  get_dataset_stats: { fields: ["total_risk_index"] },
  run_sql: { query: "select supplier_id, unit_price_eur from supplier_offerings where product_type = 'Rail brake pads' order by unit_price_eur" },
};

function mockInput(tool: string): Record<string, unknown> {
  try {
    const env = JSON.parse(readFileSync(path.join(root, "src/lib/data-api/mocks", `${tool}.json`), "utf8"));
    const input = env?.meta?.mock_input;
    return input && typeof input === "object" ? input : {};
  } catch {
    return {};
  }
}

async function main() {
  const { callDataTool, dataApiConfig } = await import("./client");
  const cfg = dataApiConfig();
  console.log(`DATA_API_URL=${cfg.url || "(empty)"} DATA_API_MOCK=${process.env.DATA_API_MOCK ?? "(unset)"} -> ${cfg.live ? "live first" : "engine first"}\n`);
  console.log(`${"tool".padEnd(20)} ${"source".padEnd(7)} ${"ok".padEnd(5)} ${"ms".padStart(5)}  note`);
  let failed = 0;
  for (const tool of TOOLS) {
    const t0 = performance.now();
    const env = await callDataTool(tool, mockInput(tool));
    const ms = Math.round(performance.now() - t0);
    // NOT_AVAILABLE is the expected answer for live-only tools (run_sql) without the service, not a failure.
    const notAvailable = env.error?.code === "NOT_AVAILABLE";
    if (!env.ok && !notAvailable) failed++;
    const pool = typeof env.meta?.engine_pool === "string" ? `pool ${env.meta.engine_pool}` : "";
    const note = env.ok ? pool : notAvailable ? `not available (${env.error?.message})` : `${env.error?.code}: ${env.error?.message}`;
    console.log(`${tool.padEnd(20)} ${String(env.meta?.source ?? "?").padEnd(7)} ${String(env.ok).padEnd(5)} ${String(ms).padStart(5)}  ${note}`);
  }
  console.log(`\n${TOOLS.length - failed}/${TOOLS.length} ok or expectedly not available`);

  console.log(`\ndataset brakes\n${"tool".padEnd(20)} ${"source".padEnd(7)} ${"ok".padEnd(5)} ${"ms".padStart(5)}  note`);
  let brakeFailed = 0;
  for (const tool of TOOLS) {
    const t0 = performance.now();
    const env = await callDataTool(tool, { ...BRAKE_INPUTS[tool], dataset: "brakes" });
    const ms = Math.round(performance.now() - t0);
    const notAvailable = env.error?.code === "NOT_AVAILABLE";
    if (!env.ok && !notAvailable) brakeFailed++;
    const d = env.data as Record<string, unknown> | null;
    const rows = d && (Array.isArray(d.suppliers) ? d.suppliers.length : Array.isArray(d.ranking) ? d.ranking.length : Array.isArray(d.similar) ? d.similar.length : Array.isArray(d.rows) ? d.rows.length : null);
    const note = env.ok ? [rows !== null ? `${rows} rows` : "", typeof d?.total_matching === "number" ? `of ${d.total_matching}` : ""].filter(Boolean).join(" ") : notAvailable ? `not available (${env.error?.message})` : `${env.error?.code}: ${env.error?.message}`;
    console.log(`${tool.padEnd(20)} ${String(env.meta?.source ?? "?").padEnd(7)} ${String(env.ok).padEnd(5)} ${String(ms).padStart(5)}  ${note}`);
  }
  const { loadBrakeData } = await import("./brakes");
  try {
    const t0 = performance.now();
    const b = await loadBrakeData();
    const suppliers = new Set(b.rows.map((r) => r.supplier_id)).size;
    console.log(`${"brake rows (skills)".padEnd(20)} ${b.source.padEnd(7)} ${"true".padEnd(5)} ${String(Math.round(performance.now() - t0)).padStart(5)}  ${b.rows.length} offerings, ${suppliers} suppliers${b.fallback_reason ? ` (${b.fallback_reason})` : ""}`);
  } catch (e) {
    brakeFailed++;
    console.log(`${"brake rows (skills)".padEnd(20)} ${"-".padEnd(7)} false        ${(e as Error).message}`);
  }
  console.log(`\n${TOOLS.length + 1 - brakeFailed}/${TOOLS.length + 1} ok or expectedly not available on brakes`);
  process.exit(failed || brakeFailed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
