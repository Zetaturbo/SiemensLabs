import { filterSuppliers } from "./filter-suppliers";
import { explainSupplier } from "./explain-supplier";
import { compareSuppliers } from "./compare-suppliers";
import { rankWithProfile } from "./rank-with-profile";
import { runSql } from "./run-sql";
import { researchCompany } from "./research-company";
import { shortlistMemo } from "./shortlist-memo";
import { updateWorkflow } from "./update-workflow";
import { findSimilar } from "./find-similar";
import { whatMatters } from "./what-matters";
import type { SkillDefinition } from "./types";
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

export const skillByName = (name: string) => skills.find((s) => s.name === name);

/** Suggestion chips and eval seeds come from the same examples. */
export const allExamples = () => skills.flatMap((s) => s.examples.map((q) => ({ skill: s.name, question: q })));
