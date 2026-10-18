// Mirrors the research service contract (feature/research-service: research_service/models.py).

export type Assessment = "low" | "moderate" | "elevated" | "high";
export type ResearchStatusValue = "queued" | "needs_disambiguation" | "running" | "done" | "failed";

export type ResearchSource = { title: string; url: string; publisher?: string | null; accessed?: string | null };

export type RiskFlag = {
  category: string;
  dimension?: string | null;
  severity: Assessment;
  title: string;
  finding: string;
  date?: string | null;
  sources: ResearchSource[];
};

export type ResearchReport = {
  company: { legal_name: string; country?: string | null; website?: string | null; lei?: string | null };
  summary: string;
  overall_assessment: Assessment;
  risk_flags: RiskFlag[];
  category_assessment: Array<{ category: string; assessment: Assessment; rationale: string }>;
  sources: ResearchSource[];
  limitations: string;
  simulated?: boolean;
  verification_summary?: { total: number; verified: number; partial: number; dropped: number } | null;
};

export type ResearchProgressStep = { step: string; message: string; agent?: string | null; ts?: string | null };

/** What GET /api/research/[jobId] returns to the dashboard. */
export type ResearchJobView = {
  job_id: string;
  mode: "live" | "replay";
  status: ResearchStatusValue;
  progress: ResearchProgressStep[];
  report: ResearchReport | null;
  error?: string | null;
};

// Dataset ids with invented names (same rule as the service's SYNTHETIC_ENTITY guard).
const SYNTHETIC_ID = /^(?:SUPP|BRK)_\d+$/i;

export function isResearchable(supplierId: string): boolean {
  return !SYNTHETIC_ID.test(supplierId);
}
