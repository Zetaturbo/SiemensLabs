import { randomUUID } from "node:crypto";
import replayReport from "@/lib/research-replay-report.json";
import type { ResearchJobView, ResearchProgressStep, ResearchReport, ResearchStatusValue } from "@/lib/research-types";

/**
 * Server-side client for the research service (feature/research-service).
 * RESEARCH_API_URL set   -> POST {RESEARCH_API_URL}/tools/<tool>, envelope {ok, data, meta, error}.
 * RESEARCH_API_URL unset -> replay mode: a short canned run that returns the service's simulated mock report.
 */
const BASE = process.env.RESEARCH_API_URL?.replace(/\/+$/, "") || null;

type Envelope<T> = { ok: boolean; data: T | null; error: { code: string; message: string } | null };

export class ResearchError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

async function call<T>(tool: string, input: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ResearchError("UNAVAILABLE", `Research service is not reachable at ${BASE}.`);
  }
  const envelope = (await response.json().catch(() => null)) as Envelope<T> | null;
  if (!envelope?.ok || envelope.data == null) {
    throw new ResearchError(
      envelope?.error?.code ?? "INTERNAL",
      envelope?.error?.message ?? `${tool} failed (${response.status}).`,
    );
  }
  return envelope.data;
}

// globalThis so replay jobs survive dev reloads and are shared across route bundles.
const g = globalThis as typeof globalThis & { __researchReplayJobs?: Map<string, number> };
const replayJobs = (g.__researchReplayJobs ??= new Map<string, number>());

const REPLAY_STEPS: Array<[number, ResearchProgressStep]> = [
  [0, { step: "plan", agent: "planner", message: "Planning research questions" }],
  [1200, { step: "search", agent: "news", message: "Searching news, company, legal and science sources" }],
  [2600, { step: "verify", agent: "verifier", message: "Verifying claims against their sources" }],
  [4000, { step: "report", agent: "writer", message: "Report ready" }],
];

export async function startResearch(input: {
  company_name: string;
  country?: string | null;
  supplier_id: string;
}): Promise<{ job_id: string; mode: "live" | "replay" }> {
  if (BASE) {
    const data = await call<{ job_id: string }>("research_company", input);
    return { job_id: data.job_id, mode: "live" };
  }
  const job_id = `res_replay_${randomUUID().slice(0, 8)}`;
  replayJobs.set(job_id, Date.now());
  return { job_id, mode: "replay" };
}

export async function getResearchJob(job_id: string): Promise<ResearchJobView> {
  if (BASE) {
    const status = await call<{ status: ResearchStatusValue; progress?: ResearchProgressStep[]; error?: string | null }>(
      "get_research_status",
      { job_id },
    );
    const report = status.status === "done" ? await call<ResearchReport>("get_research_report", { job_id }) : null;
    return { job_id, mode: "live", status: status.status, progress: status.progress ?? [], report, error: status.error };
  }

  const startedAt = replayJobs.get(job_id);
  if (startedAt === undefined) throw new ResearchError("NOT_FOUND", `Unknown research job ${job_id}.`);
  const elapsed = Date.now() - startedAt;
  const progress = REPLAY_STEPS.filter(([at]) => elapsed >= at).map(([, step]) => step);
  const done = elapsed >= REPLAY_STEPS[REPLAY_STEPS.length - 1][0];
  return {
    job_id,
    mode: "replay",
    status: done ? "done" : "running",
    progress,
    report: done ? ({ ...replayReport, simulated: true } as ResearchReport) : null,
  };
}
