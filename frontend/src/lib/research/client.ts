import "server-only";
import { randomUUID } from "node:crypto";
import type { Envelope } from "@/lib/data-api/types";
import { REPLAY_JOB, REPLAY_JOB_ID, REPLAY_REPORT, isReplayCompany, replayStatus } from "./replay";
import type { ResearchJobState, ResearchJobSummary, ResearchReport, ResearchStartInput, ResearchStatus } from "./types";

/**
 * Client for the research service (research/, ARCHITECTURE.md section 6).
 * RESEARCH_API_URL set   -> POST {RESEARCH_API_URL}/tools/<tool> with the tool input, envelope {ok, data, meta, error}
 *                           (same convention as the data service). Start it with research/scripts/serve.sh (port 8001).
 * RESEARCH_API_URL unset -> replay mode: plays back the recorded live run for Knorr-Bremse (replay.ts).
 */
const BASE = process.env.RESEARCH_API_URL?.replace(/\/+$/, "") || null;
export const researchMode = (): "live" | "replay" => (BASE ? "live" : "replay");
export const researchHost = () => (BASE ? BASE.replace(/^https?:\/\//, "") : null);

/** A failed tool call with the service's error code (SYNTHETIC_ENTITY, UNKNOWN_JOB, NOT_READY, INVALID_INPUT, INTERNAL, UNAVAILABLE). */
export class ResearchError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ResearchError";
  }
}

/**
 * Dataset supplier ids (SUPP_00018 portfolio, BRK_0020 brakes) have invented names; the service refuses them.
 * Same rule and sentence as research/research_service/guards.py, so replay mode refuses exactly like the service.
 */
const SYNTHETIC_ID = /\b(?:SUPP|BRK)_\d+\b/i;
export function syntheticRefusal(company_name: string): string | null {
  const m = SYNTHETIC_ID.exec(company_name);
  return m
    ? `${m[0].toUpperCase()} is a dataset supplier with an invented name and cannot be researched on the web. Research the real company behind it by its legal name.`
    : null;
}

// globalThis so every route bundle in the process shares the same jobs (dev HMR, separate route chunks).
const g = globalThis as typeof globalThis & {
  __researchReplayJobs?: Map<string, { company: string; startedAt: number; supplier_id: string | null; created_at: string }>;
  __researchJobStates?: Map<string, ResearchJobState>;
};
const replayJobs = (g.__researchReplayJobs ??= new Map());
const jobStates = (g.__researchJobStates ??= new Map());

async function call<T>(tool: string, input: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/tools/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new ResearchError("UNAVAILABLE", `The research service is not reachable at ${researchHost()}.`);
  }
  const env = (await res.json().catch(() => null)) as Envelope<T> | null;
  if (!env?.ok || env.data == null) throw new ResearchError(env?.error?.code ?? "INTERNAL", env?.error?.message ?? `${tool} failed (${res.status}).`);
  return env.data;
}

export async function startResearch(input: ResearchStartInput): Promise<{ job_id: string; status: string }> {
  if (BASE) {
    // auto_confirm: a name that matches several registry entities uses the best match unless the caller asks to choose.
    return call("research_company", { ...input, auto_confirm: input.auto_confirm ?? true });
  }
  const refusal = syntheticRefusal(input.company_name);
  if (refusal) throw new ResearchError("SYNTHETIC_ENTITY", refusal);
  const job_id = `res_replay_${randomUUID().slice(0, 6)}`;
  replayJobs.set(job_id, { company: input.company_name, startedAt: Date.now(), supplier_id: input.supplier_id ?? null, created_at: new Date().toISOString() });
  return { job_id, status: "queued" };
}

export async function getResearchStatus(job_id: string): Promise<ResearchStatus> {
  if (BASE) return call("get_research_status", { job_id });
  if (job_id === REPLAY_JOB_ID) return replayStatus(job_id, REPLAY_JOB.company_name, Infinity);
  const job = replayJobs.get(job_id);
  if (!job) throw new ResearchError("UNKNOWN_JOB", `${job_id} does not exist`);
  return { ...replayStatus(job_id, job.company, Date.now() - job.startedAt), supplier_id: job.supplier_id };
}

export async function getResearchReport(job_id: string): Promise<ResearchReport> {
  if (BASE) return call("get_research_report", { job_id });
  const job = replayJobs.get(job_id);
  if (job_id !== REPLAY_JOB_ID && (!job || !isReplayCompany(job.company))) throw new ResearchError("NOT_READY", `No replay report for job ${job_id}`);
  return { ...REPLAY_REPORT, supplier_id: job?.supplier_id ?? REPLAY_JOB.supplier_id ?? null };
}

export async function confirmEntity(job_id: string, candidate_id: string): Promise<ResearchStatus> {
  if (BASE) return call("confirm_entity", { job_id, candidate_id });
  return getResearchStatus(job_id);
}

/**
 * Job history, newest first. Live: list_research_jobs; when the service is down the list falls back to replay jobs
 * and says why. Replay: the recorded Knorr-Bremse run plus the replay jobs started in this server process.
 */
export async function listResearchJobs(limit = 50): Promise<{ mode: "live" | "replay"; jobs: ResearchJobSummary[]; error?: string }> {
  const replay = (): ResearchJobSummary[] => [
    ...[...replayJobs.entries()].reverse().map(([job_id, j]) => ({
      job_id,
      company_name: j.company,
      status: replayStatus(job_id, j.company, Date.now() - j.startedAt).status,
      supplier_id: j.supplier_id,
      simulated: false,
      created_at: j.created_at,
      mode: "replay" as const,
    })),
    REPLAY_JOB,
  ];
  if (!BASE) return { mode: "replay", jobs: replay() };
  try {
    const data = await call<{ jobs: Array<Omit<ResearchJobSummary, "mode">> }>("list_research_jobs", { limit });
    return { mode: "live", jobs: data.jobs.map((j) => ({ ...j, mode: "live" as const })) };
  } catch (e) {
    return { mode: "replay", jobs: [REPLAY_JOB], error: e instanceof Error ? e.message : String(e) };
  }
}

/** A job that never started (refused or service unreachable), stored like a live job so the block shows one sentence. */
export function refusedJobState(company_name: string, error: ResearchError, supplier_id?: string | null): ResearchJobState {
  const now = new Date().toISOString();
  return {
    kind: "research_job",
    job_id: "",
    company_name,
    mode: researchMode(),
    status: "failed",
    progress: [],
    report: null,
    error: error.message,
    error_code: error.code,
    supplier_id: supplier_id ?? null,
    started_at: now,
    updated_at: now,
  };
}

/** One poll: status, progress, candidates and (when done) the report. Never throws; errors land on the state. */
export async function refreshJob(state: ResearchJobState): Promise<void> {
  try {
    const s = await getResearchStatus(state.job_id);
    state.status = s.status;
    state.progress = s.progress ?? [];
    state.candidates = s.candidates;
    state.error = s.error;
    state.supplier_id = s.supplier_id ?? state.supplier_id ?? null;
    if (s.status === "done" && !state.report) {
      state.report = await getResearchReport(state.job_id);
      if (!state.company_name || state.company_name === state.job_id) state.company_name = state.report.company.legal_name;
    }
  } catch (e) {
    const code = e instanceof ResearchError ? e.code : "INTERNAL";
    state.error = e instanceof Error ? e.message : String(e);
    state.error_code = code;
    // A job the service does not know (restarted without its job store) or whose report failed will not recover.
    if (code === "UNKNOWN_JOB" || (code === "INTERNAL" && state.status === "done")) state.status = "failed";
  }
  state.updated_at = new Date().toISOString();
}

/**
 * Creates the live job state and keeps it updated in the background (poll every 2.5 s, up to 15 min).
 * The same object is stored under a result handle, so /api/results/:id serves fresh progress.
 */
export function trackResearchJob(job_id: string, company_name: string, supplier_id?: string | null): ResearchJobState {
  const existing = jobStates.get(job_id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const state: ResearchJobState = {
    kind: "research_job",
    job_id,
    company_name,
    mode: researchMode(),
    status: "queued",
    progress: [],
    report: null,
    supplier_id: supplier_id ?? null,
    started_at: now,
    updated_at: now,
  };
  jobStates.set(job_id, state);
  const deadline = Date.now() + 15 * 60_000;
  const tick = async () => {
    await refreshJob(state);
    const finished = state.status === "done" || state.status === "failed";
    if (!finished && Date.now() < deadline) setTimeout(tick, 2500);
  };
  setTimeout(tick, 300);
  return state;
}

export const getTrackedJob = (job_id: string) => jobStates.get(job_id);
