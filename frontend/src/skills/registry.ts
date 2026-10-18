import { filterSuppliers } from "./filter-suppliers";
import type { SkillDefinition } from "./types";
import type { z } from "zod/v4";

// Add skills here in priority order. Core: filter_suppliers, explain_supplier, compare_suppliers,
// rank_with_profile, shortlist_memo, research_company, run_sql. Optional: find_similar, rfi_questions, negotiation_brief.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const skills: SkillDefinition<z.ZodType, any>[] = [filterSuppliers];

export const skillByName = (name: string) => skills.find((s) => s.name === name);

/** Suggestion chips and eval seeds come from the same examples. */
export const allExamples = () => skills.flatMap((s) => s.examples.map((q) => ({ skill: s.name, question: q })));
