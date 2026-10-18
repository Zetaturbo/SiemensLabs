import { filterSuppliers, filterSuppliersBrakes } from "./filter-suppliers";
import { explainSupplier, explainSupplierBrakes } from "./explain-supplier";
import { compareSuppliers } from "./compare-suppliers";
import { rankWithProfile } from "./rank-with-profile";
import { runSql, runSqlBrakes } from "./run-sql";
import { researchCompany } from "./research-company";
import { shortlistMemo } from "./shortlist-memo";
import { updateWorkflow, updateWorkflowBrakes } from "./update-workflow";
import { findSimilar } from "./find-similar";
import { whatMatters } from "./what-matters";
import { findOfferings } from "./find-offerings";
import { qualifyForRfq } from "./qualify-for-rfq";
import type { SkillDefinition } from "./types";
import type { Dataset } from "@/lib/data-api/datasets";
import type { z } from "zod/v4";

/**
 * Priority order. Core: the seven data/research/memo skills, update_workflow (UI actions) and what_matters (guidance).
 * Optional: find_similar. Ideas not built yet: rfi_questions, negotiation_brief.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry; each skill is typed at its definition
export const skills: SkillDefinition<z.ZodType, any>[] = [
  filterSuppliers,
  explainSupplier,
  compareSuppliers,
  rankWithProfile,
  runSql,
  researchCompany,
  shortlistMemo,
  updateWorkflow,
  whatMatters,
  findSimilar,
];

/**
 * The brakes dataset (brake RFQ cases): the two RFQ skills first, then the same tool names as the portfolio with
 * brake-aware variants where the input or the answer differs (filter fields, the briefing in explain_supplier,
 * the run_sql views). research_company stays for real companies only (brake suppliers are invented).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry
export const brakeSkills: SkillDefinition<z.ZodType, any>[] = [
  findOfferings,
  qualifyForRfq,
  explainSupplierBrakes,
  filterSuppliersBrakes,
  compareSuppliers,
  rankWithProfile,
  findSimilar,
  shortlistMemo,
  updateWorkflowBrakes,
  whatMatters,
  researchCompany,
  runSqlBrakes,
];

/** Skills the model sees on a dataset: the portfolio registry stays exactly as it was. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous registry
export const skillsFor = (dataset: Dataset | undefined): SkillDefinition<z.ZodType, any>[] => (dataset === "brakes" ? brakeSkills : skills);

export const skillByName = (name: string) => skills.find((s) => s.name === name) ?? brakeSkills.find((s) => s.name === name);

/** Suggestion chips and eval seeds come from the same examples. */
export const allExamples = () => skills.flatMap((s) => s.examples.map((q) => ({ skill: s.name, question: q })));
