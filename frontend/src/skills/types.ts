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

export const EMPTY_WORKFLOW: WorkflowContext = {
  workflow_step: "define",
  profile_id: "default",
  hard_requirements: [],
  shortlist: [],
  selected_supplier: null,
  buyer_inputs: {},
};

export type CaseStage = "long_list" | "shortlist" | "finalists" | "awarded";

/**
 * Structured UI changes the chat may request (ARCHITECTURE.md section 7 plus assign_part and set_case_stage).
 * Delivered to the client as `data-ui-actions` stream parts; the chat panel applies them.
 */
export type UiAction =
  | { type: "add_to_shortlist"; ids: string[] }
  | { type: "remove_from_shortlist"; ids: string[] }
  | { type: "set_profile"; profile_id: string }
  | { type: "open_supplier"; id: string }
  | { type: "open_compare"; ids?: string[] }
  | { type: "start_research"; job_id: string; company_name: string; result_id: string; supplier_id?: string }
  | { type: "assign_part"; part_id: string; owner: { name: string; department: string } }
  | { type: "set_case_stage"; case_id: string; stage: CaseStage };

export type SkillPriority = "core" | "optional";
export type SkillStage = "shortlist" | "finalists" | "any";

export interface SkillContext {
  workflow: WorkflowContext;
  /** Store a full result; returns the handle the view references. */
  putResult: (value: unknown) => string;
  abortSignal?: AbortSignal;
}

/** A worked example for the system prompt and the routing eval: question -> exact tool input. */
export interface WorkedExample {
  question: string;
  input: Record<string, unknown>;
}

/**
 * One object per skill feeds everything: the tool the model sees, the worked
 * examples in the system prompt, the suggestion chips, and the eval cases.
 */
export interface SkillDefinition<I extends z.ZodType, R extends { handle: string }> {
  /** Named after the data tool where one exists (filter_suppliers, explain_supplier, ...). */
  name: string;
  /** Routing rule: what it computes, use when, do not use when, what it renders. */
  description: string;
  priority: SkillPriority;
  stage: SkillStage;
  input: I;
  /**
   * Calls the data API or research service, never the LLM (shortlist_memo is the one
   * documented exception: it drafts prose from computed facts).
   * Must call ctx.putResult once and return the handle in the result.
   */
  run: (input: z.infer<I>, ctx: SkillContext) => Promise<R>;
  /** One or two lines the model reads to narrate. Numbers here are the only numbers it sees. */
  summarize: (result: R) => string;
  /** Deterministic default view in OpenUI Lang (positional args), referencing the result handle. Empty string = no view. */
  view: (result: R, handle: string) => string;
  /** Optional UI actions derived deterministically from the result (e.g. start_research). */
  uiActions?: (result: R, input: z.infer<I>, workflow: WorkflowContext) => UiAction[];
  /** Example buyer questions: suggestion chips + eval seeds. */
  examples: string[];
  /** Worked examples with exact inputs, shown to the model in the system prompt. */
  workedExamples?: WorkedExample[];
}

export function defineSkill<I extends z.ZodType, R extends { handle: string }>(def: SkillDefinition<I, R>): SkillDefinition<I, R> {
  return def;
}

/** What every tool call returns to the stream (and to the client as the tool part output). */
export interface SkillToolOutput {
  skill: string;
  handle: string;
  summary: string;
  view: string;
  ui_actions: UiAction[];
}
