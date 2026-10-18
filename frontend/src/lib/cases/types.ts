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
}
