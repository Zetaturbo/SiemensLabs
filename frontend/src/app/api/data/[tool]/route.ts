import { callDataTool } from "@/lib/data-api/client";
import type { DataTool, Envelope } from "@/lib/data-api/types";
import { runMockEngine } from "../_engine/engine";

/**
 * POST /api/data/:tool  body = tool input (JSON object)  ->  the data service envelope {ok,data,meta,error}.
 *
 * The browser-facing bridge to src/lib/data-api/client.ts (server-only). Always answers 200 with an
 * envelope, except 404 for an unknown tool and 400 for a non-object body; callers check `ok`.
 * With DATA_API_MOCK=1 the input-aware mock engine (../_engine/engine.ts) answers first, so filters,
 * ids and weights are respected against mocks; it falls back to the static mock file.
 * run_sql is not exposed: the contract reserves it for the chatbot.
 */
const UI_TOOLS: ReadonlySet<DataTool> = new Set<DataTool>([
  "get_metadata",
  "list_profiles",
  "get_suppliers",
  "filter_suppliers",
  "rank_with_profile",
  "compare_suppliers",
  "explain_supplier",
  "find_similar",
  "kraljic_position",
  "get_dataset_stats",
]);

const MOCK = process.env.DATA_API_MOCK === "1";

function envelopeError(code: NonNullable<Envelope<unknown>["error"]>["code"], message: string): Envelope<null> {
  return { ok: false, data: null, meta: {}, error: { code, message } };
}

export async function POST(req: Request, ctx: RouteContext<"/api/data/[tool]">) {
  const { tool } = await ctx.params;
  if (!UI_TOOLS.has(tool as DataTool)) {
    return Response.json(envelopeError("INTERNAL", `Unknown or unavailable tool: ${tool}`), { status: 404 });
  }
  let input: Record<string, unknown> = {};
  try {
    const text = await req.text();
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("body must be a JSON object");
    input = parsed as Record<string, unknown>;
  } catch (e) {
    return Response.json(envelopeError("INVALID_FILTER", `Invalid request body: ${(e as Error).message}`), { status: 400 });
  }

  try {
    if (MOCK) {
      const engine = await runMockEngine(tool as DataTool, input);
      if (engine) return Response.json(engine);
    }
    const env = await callDataTool(tool as DataTool, input);
    return Response.json(env);
  } catch (e) {
    return Response.json(envelopeError("INTERNAL", `Data service unreachable: ${(e as Error).message}`));
  }
}
