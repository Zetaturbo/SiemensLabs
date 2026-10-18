import { callDataTool } from "@/lib/data-api/client";
import type { DataTool, Envelope } from "@/lib/data-api/types";

/**
 * POST /api/data/:tool  body = tool input (JSON object)  ->  the data service envelope {ok,data,meta,error}.
 *
 * The browser-facing bridge to src/lib/data-api/client.ts (server-only), so the screens and the chat skills
 * share one resolution order: live data service -> request-time engine (../_engine/engine.ts) -> static mock.
 * meta.source says which one answered ("live" | "engine" | "mock").
 * Always answers 200 with an envelope, except 404 for an unknown tool and 400 for a non-object body; callers check `ok`.
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
    return Response.json(await callDataTool(tool as DataTool, input));
  } catch (e) {
    return Response.json(envelopeError("INTERNAL", `Data lookup failed: ${(e as Error).message}`));
  }
}
