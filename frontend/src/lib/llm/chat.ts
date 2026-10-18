import "server-only";
import { isStepCount } from "ai";
import { z } from "zod/v4";
import { getMetadata } from "@/lib/prompt/metadata";
import { buildSystemPrompt } from "@/lib/prompt/system-prompt";
import { DATASETS, datasetForPart } from "@/lib/data-api/datasets";
import { skillsFor } from "@/skills/registry";
import { EMPTY_WORKFLOW, type SkillToolOutput, type WorkflowContext } from "@/skills/types";
import { CALL_SETTINGS, chatModel } from "./provider";
import { repairOnce } from "./repair";
import { buildTools } from "./tools";

export const MAX_STEPS = 3;

const conditionSchema = z.object({ field: z.string(), op: z.string(), value: z.unknown() });

/** Lenient parse of the workflow the UI sends: missing fields fall back to defaults instead of failing the turn. */
const workflowSchema = z.object({
  workflow_step: z.enum(["define", "requirements", "ranking", "compare", "deep_dive", "decide"]).catch(EMPTY_WORKFLOW.workflow_step),
  profile_id: z.string().catch("default"),
  hard_requirements: z.array(conditionSchema).catch([]),
  shortlist: z.array(z.string()).catch([]),
  selected_supplier: z.string().nullable().catch(null),
  buyer_inputs: z
    .object({ category: z.string().optional(), delivery_country: z.string().optional(), quotes: z.unknown().optional() })
    .catch({}),
  case_id: z.string().optional().catch(undefined),
  part_id: z.string().optional().catch(undefined),
  dataset: z.enum(DATASETS).optional().catch(undefined),
});

/** Lenient parse; `dataset` falls back to the part's (train-parts.json), so a brake case runs on the brakes dataset. */
export function parseWorkflow(raw: unknown): WorkflowContext {
  const parsed = workflowSchema.safeParse({ ...EMPTY_WORKFLOW, ...(raw && typeof raw === "object" ? raw : {}) });
  if (!parsed.success) return EMPTY_WORKFLOW;
  const w = parsed.data as WorkflowContext;
  return { ...w, dataset: w.dataset ?? datasetForPart(w.part_id) };
}

export interface ChatSetupOptions {
  workflow: WorkflowContext;
  modelId?: string;
  /** false = tools without execute (routing eval). */
  execute?: boolean;
  onOutput?: (output: SkillToolOutput, toolCallId: string) => void;
}

/** Everything streamText needs for one turn; shared by POST /api/chat and the routing eval so they cannot drift. */
export async function chatSetup({ workflow, modelId, execute = true, onOutput }: ChatSetupOptions) {
  const metadata = await getMetadata();
  const model = chatModel(modelId);
  const skills = skillsFor(workflow.dataset); // the brakes dataset adds the RFQ skills (src/skills/registry.ts)
  const tools = buildTools({ workflow, execute, onOutput, skills });
  const schemaOnly = execute ? buildTools({ workflow, execute: false, skills }) : tools;
  return {
    model,
    tools,
    instructions: buildSystemPrompt({ metadata, workflow, skills }),
    stopWhen: isStepCount(MAX_STEPS),
    repairToolCall: repairOnce(model, schemaOnly),
    ...CALL_SETTINGS,
  };
}
