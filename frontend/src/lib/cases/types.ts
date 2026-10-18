export type Stage = "none" | "long_list" | "shortlist" | "finalists" | "awarded";

export interface Owner {
  name: string;
  department: string;
}

export interface SourcingCase {
  id: string;
  partId: string;
  stage: Stage;
  owner: Owner | null;
  profileId: string;
  hardRequirements: Array<{ field: string; op: string; value: unknown }>;
  shortlist: string[];
  finalists: string[];
  awardedSupplier: string | null;
  /** supplier_id -> linked legal entity (real company) for research */
  linkedEntities: Record<string, { legal_name: string; country?: string; website?: string; job_id?: string }>;
  riskSummary: { level: "Low" | "Medium" | "High" | "Critical" | null; flagCount: number };
  log: Array<{ at: string; who: string; what: string }>;
  updatedAt: string;
  /** Awarded cases: who won, two sentences why (grounded in the data), when. */
  decision?: { supplier: string; rationale: string; at: string };
  /** Finalists cases: one-line buyer notes, e.g. "research on SUPP_00018 found two open compliance flags". */
  notes?: string[];
  /** Matching count for `filtersKey` (JSON of hardRequirements) when it was seeded; ignore it once the filters differ. */
  matching?: { count: number; filtersKey: string };
}

/** Where a team member is right now: the case they have open (null = offline) and when they were last active. */
export interface Presence {
  caseId: string | null;
  lastSeen: string;
}
