// Mirrors ARCHITECTURE.md section 6 (research agent contract) and the research service as built
// (research/research_service/models.py and tools.py). Fields the service adds beyond section 6 are optional,
// so the replay mode and older reports keep working. Mismatches: docs/research-contract-notes.md.

export type ResearchFocus = "financial" | "legal" | "sanctions" | "esg" | "operations";
export type ResearchStatusValue = "queued" | "needs_disambiguation" | "running" | "done" | "failed";
export type Assessment = "low" | "moderate" | "elevated" | "high";
/** Report categories the service assesses (research/research_service/agents.py CATEGORIES). */
export type ResearchCategory = "financial" | "legal" | "sanctions" | "quality" | "safety" | "esg" | "operations" | "geopolitical";
export type ClaimStatus = "pending" | "verified" | "partial" | "unsupported" | "contradicted";

export interface ResearchStartInput {
  company_name: string;
  /** ISO 3166 alpha-2 code; the service also maps English country names ("Germany") and drops anything else. */
  country?: string | null;
  website?: string | null;
  /** Dataset supplier this company stands for (SUPP_/BRK_ id); stored on the job, never researched itself. */
  supplier_id?: string | null;
  /** When several registry entities match, use the best match instead of asking the buyer (default true here). */
  auto_confirm?: boolean;
  /** Section 6.1 inputs; the service accepts and ignores them (it always runs all four lanes). */
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
  /** Which agent emitted it: planner, news, company, legal, science, verifier, writer. */
  agent?: string | null;
  ts?: string | null;
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
  supplier_id?: string | null;
  /** True for the service's sandbox demo companies (simulated documents). */
  simulated?: boolean;
}

export interface ResearchSource {
  title: string;
  url: string;
  publisher?: string | null;
  accessed?: string | null;
}

/** One extracted finding with its verbatim quote; only `verified` claims reach the report's flags. */
export interface ResearchClaim {
  claim_id: string;
  run_id?: string | null;
  dimension: string;
  category?: string | null;
  statement: string;
  severity: Assessment;
  quote: string;
  source_url: string;
  source_title?: string | null;
  publisher?: string | null;
  published?: string | null;
  event_date?: string | null;
  retrieved_at?: string | null;
  agent: string;
  status: ClaimStatus;
  corroborated_by?: string[];
  simulated?: boolean;
}

export interface RiskFlag {
  category: string;
  /** Dataset risk dimension the flag maps to (compliance_risk, safety_incident, ...). */
  dimension?: string | null;
  severity: Assessment;
  title: string;
  finding: string;
  date: string | null;
  /** Claims the flag is built from; all verified. */
  claim_ids?: string[];
  verification?: "verified";
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
  job_id?: string | null;
  supplier_id?: string | null;
  simulated?: boolean;
  /** Every claim of the run with its verification status (verified, partial, unsupported, ...). */
  claims?: ResearchClaim[];
  verification_summary?: { total: number; verified: number; partial: number; dropped: number } | null;
}

/** One row of list_research_jobs (the service's job history), plus where it came from. */
export interface ResearchJobSummary {
  job_id: string;
  company_name: string;
  status: ResearchStatusValue;
  supplier_id?: string | null;
  simulated?: boolean;
  created_at: string;
  mode: "live" | "replay";
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
  /** Service error code when the job could not be started or read (SYNTHETIC_ENTITY, UNKNOWN_JOB, UNAVAILABLE, ...). */
  error_code?: string;
  supplier_id?: string | null;
  started_at: string;
  updated_at: string;
}
