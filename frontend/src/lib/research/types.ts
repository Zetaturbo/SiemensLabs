// Mirrors ARCHITECTURE.md section 6 (research agent contract).

export type ResearchFocus = "financial" | "legal" | "sanctions" | "esg" | "operations";
export type ResearchStatusValue = "queued" | "needs_disambiguation" | "running" | "done" | "failed";
export type Assessment = "low" | "moderate" | "elevated" | "high";

export interface ResearchStartInput {
  company_name: string;
  country?: string | null;
  website?: string | null;
  focus?: ResearchFocus[];
  depth?: "quick" | "standard";
  /** Dataset id the buyer started from; a label on the report only. */
  supplier_id?: string | null;
  /** Use the best match when the name fits several companies (no disambiguation step). */
  auto_confirm?: boolean;
}

export interface ResearchProgressStep {
  step: string;
  message: string;
}

export interface ResearchCandidate {
  candidate_id: string;
  legal_name: string;
  country?: string | null;
  website?: string | null;
  lei?: string | null;
}

export interface ResearchStatus {
  job_id: string;
  status: ResearchStatusValue;
  progress: ResearchProgressStep[];
  candidates?: ResearchCandidate[];
  error?: string;
}

export interface ResearchSource {
  title: string;
  url: string;
  publisher?: string;
  accessed?: string;
}

export interface RiskFlag {
  category: string;
  severity: Assessment;
  title: string;
  finding: string;
  date: string | null;
  sources: ResearchSource[];
}

export interface ResearchReport {
  company: { legal_name: string; country?: string | null; website?: string | null; lei?: string | null };
  summary: string;
  overall_assessment: Assessment;
  risk_flags: RiskFlag[];
  category_assessment: Array<{ category: string; assessment: Assessment; rationale: string }>;
  sources: ResearchSource[];
  limitations: string;
  simulated?: boolean;
  verification_summary?: { total: number; verified: number; partial: number; dropped: number } | null;
}

/**
 * Live job state stored under a result handle. A background tracker mutates it in place,
 * so GET /api/results/:id always returns the latest status, progress and (when done) the report.
 */
export interface ResearchJobState {
  kind: "research_job";
  job_id: string;
  company_name: string;
  mode: "live" | "replay";
  status: ResearchStatusValue;
  progress: ResearchProgressStep[];
  candidates?: ResearchCandidate[];
  report: ResearchReport | null;
  error?: string;
  started_at: string;
  updated_at: string;
}
