import { ResearchError, confirmEntity, getTrackedJob, refreshJob, trackResearchJob } from "@/lib/research/client";

/**
 * GET /api/research/:jobId[?company=Name] -> ResearchJobState (status, progress, candidates, report when done).
 * A job this server has not seen yet (one from the service's job history) starts being tracked on first read.
 */
export async function GET(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const known = getTrackedJob(jobId);
  if (known) return Response.json(known);
  const company = new URL(req.url).searchParams.get("company") ?? jobId;
  const state = trackResearchJob(jobId, company);
  await refreshJob(state);
  if (state.error_code === "UNKNOWN_JOB") return Response.json({ error: state.error ?? "unknown research job" }, { status: 404 });
  return Response.json(state);
}

/** POST /api/research/:jobId  body { candidate_id } -> confirm_entity for needs_disambiguation. */
export async function POST(req: Request, ctx: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { candidate_id?: string } | null;
  if (!body?.candidate_id) return Response.json({ error: "candidate_id is required" }, { status: 400 });
  try {
    const status = await confirmEntity(jobId, body.candidate_id);
    const state = getTrackedJob(jobId) ?? trackResearchJob(jobId, jobId);
    state.status = status.status;
    state.progress = status.progress ?? state.progress;
    state.candidates = status.candidates;
    return Response.json(state);
  } catch (e) {
    if (!(e instanceof ResearchError)) throw e;
    return Response.json({ error: e.message, code: e.code }, { status: e.code === "UNKNOWN_JOB" ? 404 : 422 });
  }
}
