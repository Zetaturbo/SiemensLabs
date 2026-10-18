import type { SourcingCase } from "./types";

const now = new Date().toISOString();
const mk = (c: Partial<SourcingCase> & Pick<SourcingCase, "id" | "partId" | "stage">): SourcingCase => ({
  owner: null,
  profileId: "default",
  hardRequirements: [],
  shortlist: [],
  finalists: [],
  awardedSupplier: null,
  linkedEntities: {},
  riskSummary: { level: null, flagCount: 0 },
  log: [],
  updatedAt: now,
  ...c,
});

/** Seeded states so the train map looks alive on day one. The brake system is the live case. */
export const seedCases: SourcingCase[] = [
  mk({ id: "case_pantograph", partId: "pantograph", stage: "awarded", owner: { name: "Lena K.", department: "Traction" }, profileId: "strategic_system", awardedSupplier: "SUPP_00003", riskSummary: { level: "Medium", flagCount: 0 } }),
  mk({ id: "case_doors", partId: "doors", stage: "shortlist", owner: { name: "Tom R.", department: "Body systems" }, profileId: "safety_critical", shortlist: ["SUPP_00002", "SUPP_00004"], riskSummary: { level: "High", flagCount: 0 } }),
  mk({ id: "case_train_control", partId: "train_control", stage: "finalists", owner: { name: "Aisha M.", department: "Control" }, profileId: "strategic_system", finalists: ["SUPP_00018"], riskSummary: { level: "Critical", flagCount: 2 } }),
  mk({ id: "case_hvac", partId: "hvac", stage: "awarded", owner: { name: "Tom R.", department: "Body systems" }, profileId: "commodity", awardedSupplier: "SUPP_00002", riskSummary: { level: "Medium", flagCount: 0 } }),
  mk({ id: "case_interiors", partId: "interiors", stage: "long_list", owner: { name: "Lena K.", department: "Traction" }, profileId: "lksg_due_diligence", riskSummary: { level: null, flagCount: 0 } }),
];
