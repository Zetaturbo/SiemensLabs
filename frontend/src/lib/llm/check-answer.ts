import "server-only";
import { createParser, type LibraryJSONSchema } from "@openuidev/lang-core";
import openui from "@/lib/prompt/openui.generated.json";
import { getResult } from "@/lib/results/store";
import type { SkillToolOutput } from "@/skills/types";
import { handlesIn, splitAssistantText, splitNextLine, type AnswerPart } from "./answer";

const parser = createParser(openui.jsonSchema as unknown as LibraryJSONSchema, openui.root ?? undefined);

/** Problems in an OpenUI program: parser errors, missing root, handles that do not exist. */
export function programIssues(code: string): string[] {
  const res = parser.parse(code);
  const issues = res.meta.errors.map((e) => `${e.code}: ${e.message}`);
  if (!res.root) issues.push("no-root: program has no renderable root");
  for (const h of handlesIn(code)) if (getResult(h) === undefined) issues.push(`unknown-handle: ${h}`);
  return issues;
}

/**
 * Decides what the client renders for the turn. The model's program wins when it has no more
 * issues than the deterministic default view of the last successful skill; otherwise the default view is used.
 * Unknown components count as issues for both, so a block the UI has not registered yet does not
 * make the model's program lose to an equally unknown default.
 */
export function buildAnswerPart(text: string, outputs: SkillToolOutput[]): AnswerPart {
  const split = splitAssistantText(text);
  // The trailing "Next: ..." nudge leaves the prose and travels on its own (the chat renders it as the primary chip).
  // A nudge written inside the fence is taken out of the program too.
  const inProse = splitNextLine(split.prose);
  const inCode = split.code ? splitNextLine(split.code) : null;
  const prose = inProse.prose;
  const next = inProse.next ?? inCode?.next ?? null;
  const code = inCode ? inCode.prose || null : null;
  const fallback = [...outputs].reverse().find((o) => o.view)?.view ?? null;
  if (!code && !fallback) return { prose, next, openui: null, source: "none", issues: [] };
  const modelIssues = code ? programIssues(code) : ["no-program: answer had no openui-lang block"];
  if (!fallback) return { prose, next, openui: code, source: "model", issues: modelIssues };
  const fallbackIssues = programIssues(fallback);
  if (code && modelIssues.length <= fallbackIssues.length) return { prose, next, openui: code, source: "model", issues: modelIssues };
  return { prose, next, openui: fallback, source: "fallback", issues: modelIssues };
}
