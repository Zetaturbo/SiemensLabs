import { putResult } from "@/lib/results/store";
import { ResearchError, listResearchJobs, refusedJobState, startResearch, trackResearchJob } from "@/lib/research/client";
import type { ResearchStartInput } from "@/lib/research/types";

/**
 * POST /api/research  body ResearchStartInput (ARCHITECTURE.md 6.1)
 * Starts a research job from the UI (same path as the research_company skill) and returns
 * { job_id, result_id }. Poll GET /api/results/:result_id or GET /api/research/:job_id.
 * A refused start (SYNTHETIC_ENTITY, service unreachable) returns 422 with { error, code } and a result_id
 * whose state shows the refusal as one sentence.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ResearchStartInput | null;
  if (!body?.company_name) return Response.json({ error: "company_name is required" }, { status: 400 });
  try {
    const { job_id } = await startResearch(body);
    const state = trackResearchJob(job_id, body.company_name, body.supplier_id);
    return Response.json({ job_id, result_id: putResult(state, "research"), status: state.status, mode: state.mode });
  } catch (e) {
    if (!(e instanceof ResearchError)) throw e;
    const state = refusedJobState(body.company_name, e, body.supplier_id);
    return Response.json({ error: e.message, code: e.code, result_id: putResult(state, "research"), status: "failed", mode: state.mode }, { status: 422 });
  }
}

/** GET /api/research?limit=50 -> { mode, jobs: ResearchJobSummary[], error? } (list_research_jobs, replay job when absent). */
export async function GET(req: Request) {
  const limit = Number(new URL(req.url).searchParams.get("limit") ?? 50);
  return Response.json(await listResearchJobs(Number.isFinite(limit) && limit > 0 ? Math.min(limit, 200) : 50));
}
