import { putResult } from "@/lib/results/store";
import { startResearch, trackResearchJob } from "@/lib/research/client";
import type { ResearchStartInput } from "@/lib/research/types";

/**
 * POST /api/research  body ResearchStartInput (ARCHITECTURE.md 6.1)
 * Starts a research job from the UI (same path as the research_company skill) and returns
 * { job_id, result_id }. Poll GET /api/results/:result_id or GET /api/research/:job_id.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ResearchStartInput | null;
  if (!body?.company_name) return Response.json({ error: "company_name is required" }, { status: 400 });
  const { job_id } = await startResearch(body);
  const state = trackResearchJob(job_id, body.company_name);
  return Response.json({ job_id, result_id: putResult(state, "research"), status: state.status, mode: state.mode });
}
