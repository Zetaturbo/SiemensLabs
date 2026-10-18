/**
 * pnpm check:data  -  calls every data tool once through callDataTool and prints tool, source, ok.
 *
 *   pnpm check:data                                              # DATA_API_URL / DATA_API_MOCK from frontend/.env
 *   DATA_API_MOCK=0 DATA_API_URL=http://localhost:8000 pnpm check:data
 *
 * Inputs are the ones each static mock answers (meta.mock_input in src/lib/data-api/mocks/<tool>.json), so a
 * live, engine and mock answer can be compared for the same call. Exits 1 when any tool returns ok: false,
 * except NOT_AVAILABLE (run_sql without the live service), which is printed as "not available".
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
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
