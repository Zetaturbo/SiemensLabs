import type { z } from "zod/v4";
import type { FilterCondition } from "@/lib/data-api/types";

/** Workflow context the UI sends on every chat turn (ARCHITECTURE.md section 7). */
export interface WorkflowContext {
  workflow_step: "define" | "requirements" | "ranking" | "compare" | "deep_dive" | "decide";
  profile_id: string;
  hard_requirements: FilterCondition[];
  shortlist: string[];
  selected_supplier: string | null;
  buyer_inputs: { category?: string; delivery_country?: string; quotes?: unknown };
  case_id?: string;
  part_id?: string;
}

export type SkillPriority = "core" | "optional";
export type SkillStage = "shortlist" | "finalists" | "any";

export interface SkillContext {
  workflow: WorkflowContext;
  /** Store a full result; returns the handle the view references. */
  putResult: (value: unknown) => string;
}

/**
 * One object per skill feeds everything: the tool the model sees, the worked
 * examples in the system prompt, the suggestion chips, and the eval cases.
 */
export interface SkillDefinition<I extends z.ZodType, R> {
  /** Named after the data tool where one exists (filter_suppliers, explain_supplier, ...). */
  name: string;
  /** Routing rule: what it computes, use when, do not use when, what it renders. */
  description: string;
  priority: SkillPriority;
  stage: SkillStage;
  input: I;
  /** Pure: calls the data API or research service, never the LLM. */
  run: (input: z.infer<I>, ctx: SkillContext) => Promise<R>;
  /** One or two lines the model reads to narrate. Numbers here are the only numbers it sees. */
  summarize: (result: R) => string;
  /** Deterministic default view in OpenUI Lang, referencing the result handle. */
  view: (result: R, handle: string) => string;
  /** Example buyer questions: suggestion chips + eval seeds. */
  examples: string[];
}

export function defineSkill<I extends z.ZodType, R>(def: SkillDefinition<I, R>): SkillDefinition<I, R> {
  return def;
}
