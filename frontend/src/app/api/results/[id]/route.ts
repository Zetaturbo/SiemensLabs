import { getResult } from "@/lib/results/store";

/** Components fetch full skill results by handle; the model only ever saw a summary. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const value = getResult(id);
  if (value === undefined) return Response.json({ error: "unknown or expired result" }, { status: 404 });
  return Response.json(value);
}
