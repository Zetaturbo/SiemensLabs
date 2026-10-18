import "server-only";
import { tool, type Tool, type ToolSet } from "ai";
import type { z } from "zod/v4";
import { putResult } from "@/lib/results/store";
import { skills as registry } from "@/skills/registry";
import type { SkillDefinition, SkillToolOutput, WorkflowContext } from "@/skills/types";

/** Handle prefix per skill: handles look like cmp_1a2b3c4d. */
const KIND: Record<string, string> = {
  filter_suppliers: "filter",
  explain_supplier: "explain",
  compare_suppliers: "cmp",
  rank_with_profile: "rank",
  run_sql: "sql",
  research_company: "research",
  shortlist_memo: "memo",
  update_workflow: "ui",
  find_similar: "similar",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the registry is heterogeneous by design
type AnySkill = SkillDefinition<z.ZodType, any>;

export interface BuildToolsOptions {
  workflow: WorkflowContext;
  /** false = schema only (routing eval: we only need the first tool call). */
  execute?: boolean;
  /** Called after each successful skill run (the route streams ui_actions and views from here). */
  onOutput?: (output: SkillToolOutput, toolCallId: string) => void;
  skills?: AnySkill[];
}

/**
 * Skills -> AI SDK tools. execute runs the skill and returns a small SkillToolOutput
 * (handle, summary, view, ui_actions); toModelOutput hands the model only the summary text,
 * so full results never reach the model.
 */
export function buildTools({ workflow, execute = true, onOutput, skills = registry }: BuildToolsOptions): ToolSet {
  const entries = skills.map((skill): [string, Tool] => {
    if (!execute) return [skill.name, tool({ description: skill.description, inputSchema: skill.input })];
    return [
      skill.name,
      tool({
        description: skill.description,
        inputSchema: skill.input,
        execute: async (input: unknown, { toolCallId, abortSignal }): Promise<SkillToolOutput> => {
          const result = await skill.run(input, {
            workflow,
            abortSignal,
            putResult: (value) => putResult(value, KIND[skill.name] ?? skill.name.split("_")[0]),
          });
          const output: SkillToolOutput = {
            skill: skill.name,
            handle: result.handle,
            summary: skill.summarize(result),
            view: skill.view(result, result.handle),
            ui_actions: skill.uiActions?.(result, input, workflow) ?? [],
          };
          onOutput?.(output, toolCallId);
          return output;
        },
        toModelOutput: ({ output }: { output: SkillToolOutput }) => ({
          type: "text" as const,
          value: [
            output.summary,
            output.view ? `Result handle: ${output.handle}. Default view:\n${output.view}` : "No view for this result.",
            output.ui_actions.length ? `UI actions sent to the app: ${output.ui_actions.map((a) => a.type).join(", ")}.` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        }),
      }),
    ];
  });
  return Object.fromEntries(entries);
}
