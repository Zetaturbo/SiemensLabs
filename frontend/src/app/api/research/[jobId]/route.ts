import { confirmEntity, getTrackedJob, trackResearchJob } from "@/lib/research/client";

/** GET /api/research/:jobId -> ResearchJobState (status, progress, candidates, report when done). */
export async function GET(_req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const state = getTrackedJob(jobId);
  if (!state) return Response.json({ error: "unknown research job" }, { status: 404 });
  return Response.json(state);
}

/** POST /api/research/:jobId  body { candidate_id } -> confirm_entity for needs_disambiguation. */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { candidate_id?: string } | null;
  if (!body?.candidate_id) return Response.json({ error: "candidate_id is required" }, { status: 400 });
  const status = await confirmEntity(jobId, body.candidate_id);
  const state = getTrackedJob(jobId) ?? trackResearchJob(jobId, jobId);
  state.status = status.status;
  state.progress = status.progress ?? state.progress;
  return Response.json(state);
}
