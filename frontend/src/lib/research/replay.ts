import liveRun from "./replay-knorr-bremse.json";
import type { ResearchJobSummary, ResearchProgressStep, ResearchReport, ResearchStatus } from "./types";

/**
 * Replay mode (RESEARCH_API_URL unset): plays back a real research run instead of calling the service.
 *
 * The report is the research service's own output for Knorr-Bremse from a live run on 2026-10-18 (job res_7d99aa),
 * copied unchanged from mocks/research_report_knorr_bremse.json: 17 claims extracted, 12 verified, every flag with
 * its source links and access dates. Nothing in it is written by hand. The progress steps below are timed so the UI
 * shows the agent working; they use the service's message format and only name what the report itself contains
 * (the matched legal entity and the publishers it read).
 */
export const REPLAY_RUN = { job_id: "res_7d99aa", run_date: "2026-10-18" } as const;

/** Stable id of the replayed run in job lists (the Research page), always done. */
export const REPLAY_JOB_ID = "res_replay_knorr";

const report = liveRun as unknown as ResearchReport;

export const REPLAY_REPORT: ResearchReport = {
  ...report,
  limitations:
    `Replay of a live research run on ${REPLAY_RUN.run_date} (job ${REPLAY_RUN.job_id}), shown because no research service is connected; ` +
    `it was not re-run now. ${report.limitations}`,
};

const SEQUENCE: Array<{ at: number; step: ResearchProgressStep }> = [
  { at: 0, step: { step: "replay", agent: null, message: `Replaying the recorded run of ${REPLAY_RUN.run_date}` } },
  { at: 600, step: { step: "entity", agent: "planner", message: "Looking up Knorr-Bremse in the company registry (GLEIF)" } },
  { at: 1500, step: { step: "entity", agent: "planner", message: `Matched ${report.company.legal_name} (${report.company.country})` } },
  { at: 2600, step: { step: "plan", agent: "planner", message: "Planned research questions across 4 lanes: news, company, legal, science" } },
  { at: 3800, step: { step: "search", agent: "news", message: "Searching news sources: Knorr-Bremse" } },
  { at: 4400, step: { step: "search", agent: "legal", message: "Searching legal sources: Knorr-Bremse sanctions OR investigation OR lawsuit OR fine" } },
  { at: 5200, step: { step: "search", agent: "company", message: "Reading northdata.com" } },
  { at: 6000, step: { step: "search", agent: "legal", message: "Reading federalregister.gov" } },
  { at: 6800, step: { step: "search", agent: "legal", message: "Reading justice.gov" } },
  { at: 7600, step: { step: "search", agent: "news", message: "Reading handelsblatt.com" } },
  { at: 8400, step: { step: "search", agent: "science", message: "Reading patents.google.com" } },
  { at: 9800, step: { step: "verify", agent: "verifier", message: "Verifying 16 claims against their sources" } },
  { at: 12000, step: { step: "report", agent: "writer", message: "Writing the report from verified claims" } },
  { at: 13600, step: { step: "report", agent: "writer", message: "Report ready" } },
];
const DONE_AT = 14000;
const FAIL_AT = 2500;

export const isReplayCompany = (name: string) => /knorr[\s-]*bremse/i.test(name);

/** Status of a replay job `elapsedMs` after it started. */
export function replayStatus(job_id: string, company: string, elapsedMs: number): ResearchStatus {
  if (!isReplayCompany(company)) {
    const progress = [{ step: "plan", agent: "planner", message: `Planning research for ${company}` }];
    return elapsedMs < FAIL_AT
      ? { job_id, status: "running", progress }
      : {
          job_id,
          status: "failed",
          progress,
          error: `Replay mode only has the recorded Knorr-Bremse run. Connect the research service (RESEARCH_API_URL) to research ${company}.`,
        };
  }
  const progress = SEQUENCE.filter((s) => s.at <= elapsedMs).map((s) => s.step);
  if (elapsedMs >= DONE_AT) return { job_id, status: "done", progress };
  return { job_id, status: progress.length ? "running" : "queued", progress };
}

/** The replayed run as a finished job, for job lists. */
export const REPLAY_JOB: ResearchJobSummary = {
  job_id: REPLAY_JOB_ID,
  company_name: report.company.legal_name,
  status: "done",
  supplier_id: "SUPP_03267",
  simulated: false,
  // The run's first page retrieval (the report carries no start time).
  created_at: (report.claims ?? []).map((c) => c.retrieved_at ?? "").filter(Boolean).sort()[0] ?? `${REPLAY_RUN.run_date}T00:00:00Z`,
  mode: "replay",
};

export const REPLAY_DURATION_MS = DONE_AT;
