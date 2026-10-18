import "server-only";
import { randomUUID } from "node:crypto";
import type { Envelope } from "@/lib/data-api/types";
import { REPLAY_REPORT, isReplayCompany, replayStatus } from "./replay";
import type { ResearchJobState, ResearchReport, ResearchStartInput, ResearchStatus } from "./types";

/**
 * Client for the research agent's job API (ARCHITECTURE.md section 6).
 * RESEARCH_API_URL set   -> POST {RESEARCH_API_URL}/tools/<tool> with the contract input, envelope response
 *                           (same convention as the data service).
 * RESEARCH_API_URL unset -> replay mode: canned progress + report for Knorr-Bremse.
 */
const BASE = process.env.RESEARCH_API_URL?.replace(/\/+$/, "") || null;
export const researchMode = (): "live" | "replay" => (BASE ? "live" : "replay");

// globalThis so every route bundle in the process shares the same jobs (dev HMR, separate route chunks).
const g = globalThis as typeof globalThis & {
  __researchReplayJobs?: Map<string, { company: string; startedAt: number }>;
  __researchJobStates?: Map<string, ResearchJobState>;
};
const replayJobs = (g.__researchReplayJobs ??= new Map());
const jobStates = (g.__researchJobStates ??= new Map());

async function call<T>(tool: string, input: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}/tools/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  const env = (await res.json()) as Envelope<T>;
  if (!env.ok || env.data == null) throw new Error(`${tool} failed: ${env.error?.message ?? res.statusText}`);
  return env.data;
}

export async function startResearch(input: ResearchStartInput): Promise<{ job_id: string; status: string }> {
  if (BASE) return call("research_company", { focus: ["financial", "legal", "sanctions", "esg", "operations"], depth: "standard", ...input });
  const job_id = `res_replay_${randomUUID().slice(0, 6)}`;
  replayJobs.set(job_id, { company: input.company_name, startedAt: Date.now() });
  return { job_id, status: "queued" };
}

export async function getResearchStatus(job_id: string): Promise<ResearchStatus> {
  if (BASE) return call("get_research_status", { job_id });
  const job = replayJobs.get(job_id);
  if (!job) return { job_id, status: "failed", progress: [], error: `Unknown replay job ${job_id}` };
  return replayStatus(job_id, job.company, Date.now() - job.startedAt);
}

export async function getResearchReport(job_id: string): Promise<ResearchReport> {
  if (BASE) return call("get_research_report", { job_id });
  const job = replayJobs.get(job_id);
  if (!job || !isReplayCompany(job.company)) throw new Error(`No replay report for job ${job_id}`);
  return REPLAY_REPORT;
}

export async function confirmEntity(job_id: string, candidate_id: string): Promise<ResearchStatus> {
  if (BASE) return call("confirm_entity", { job_id, candidate_id });
  return getResearchStatus(job_id);
}

/**
 * Creates the live job state and keeps it updated in the background (poll every 2.5 s, up to 15 min).
 * The same object is stored under a result handle, so /api/results/:id serves fresh progress.
 */
export function trackResearchJob(job_id: string, company_name: string): ResearchJobState {
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
    started_at: now,
    updated_at: now,
  };
  jobStates.set(job_id, state);
  const deadline = Date.now() + 15 * 60_000;
  const tick = async () => {
    try {
      const s = await getResearchStatus(job_id);
      state.status = s.status;
      state.progress = s.progress ?? [];
      state.candidates = s.candidates;
      state.error = s.error;
      if (s.status === "done") state.report = await getResearchReport(job_id);
    } catch (e) {
      state.error = e instanceof Error ? e.message : String(e);
    }
    state.updated_at = new Date().toISOString();
    const finished = state.status === "done" || state.status === "failed";
    if (!finished && Date.now() < deadline) setTimeout(tick, 2500);
  };
  setTimeout(tick, 300);
  return state;
}

export const getTrackedJob = (job_id: string) => jobStates.get(job_id);
