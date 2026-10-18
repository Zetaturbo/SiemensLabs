/**
 * Routing eval: sends each question through the model with the same system prompt and tools as
 * POST /api/chat (via chatSetup), compares the first tool call to expected_skill, and reports
 * accuracy, argument matches and time to first token. Writes evals/routing/last-run.json.
 *
 *   pnpm eval:routing                                  # model from LLM_MODEL
 *   pnpm eval:routing --model a,b                      # several models, one after the other
 *   pnpm eval:routing --only compare_suppliers --limit 5
 */
import Module from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname);

// Next.js resolves "server-only" itself; in plain Node it is not installed, so point it at a no-op shim.
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(here, "server-only-shim.cjs");
  return resolveFilename.call(this, request, ...rest);
};

const root = path.resolve(here, "../..");
process.chdir(root); // data-api mocks are resolved from process.cwd()
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
process.env.DATA_API_MOCK ??= "1";

interface Question {
  question: string;
  expected_skill: string | null;
  expected_args?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  note?: string;
}

interface CaseResult {
  question: string;
  expected_skill: string | null;
  actual_skill: string | null;
  correct: boolean;
  args_ok: boolean | null;
  input_valid: boolean | null;
  input: unknown;
  ttft_ms: number | null;
  tool_call_ms: number | null;
  total_ms: number;
  text?: string;
  error?: string;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** Eval workflow: a compare-step case with the jury trio shortlisted and SUPP_00018 selected. */
const EVAL_WORKFLOW = {
  workflow_step: "compare",
  profile_id: "default",
  hard_requirements: [{ field: "quality_risk_level", op: "ne", value: "Critical" }],
  shortlist: ["SUPP_00012", "SUPP_00450", "SUPP_00731"],
  selected_supplier: "SUPP_00018",
  buyer_inputs: { category: "Brake components" },
  case_id: "case_brake_system",
  part_id: "brake_system",
};

const norm = (v: unknown): unknown =>
  typeof v === "string" ? v.toLowerCase().replace(/[\s_-]+/g, "") : Array.isArray(v) ? v.map(norm).sort() : v;

function argsMatch(expected: Record<string, unknown> | undefined, actual: unknown): boolean | null {
  if (!expected) return null;
  const a = (actual ?? {}) as Record<string, unknown>;
  return Object.entries(expected).every(([k, v]) => {
    const got = a[k];
    if (typeof v === "string" && typeof got === "string") return norm(got) === norm(v) || String(norm(got)).includes(String(norm(v)));
    return JSON.stringify(norm(got)) === JSON.stringify(norm(v));
  });
}

const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.log("LLM_API_KEY is not set (frontend/.env). Skipping the routing eval.");
    return;
  }
  const { streamText, isStepCount } = await import("ai");
  const { chatSetup, parseWorkflow } = await import("../../src/lib/llm/chat");
  const { MODEL_ID, LLM_BASE_URL } = await import("../../src/lib/llm/provider");

  let questions = JSON.parse(readFileSync(path.join(here, "questions.json"), "utf8")) as Question[];
  const only = arg("only");
  if (only) questions = questions.filter((q) => q.expected_skill === only);
  const limit = Number(arg("limit") ?? 0);
  if (limit > 0) questions = questions.slice(0, limit);
  const models = (arg("model") ?? MODEL_ID).split(",").map((m) => m.trim()).filter(Boolean);
  const runs = [];

  for (const model of models) {
    console.log(`\n== ${model} @ ${LLM_BASE_URL} : ${questions.length} questions ==`);
    const results: CaseResult[] = [];
    for (const [i, q] of questions.entries()) {
      const workflow = parseWorkflow({ ...EVAL_WORKFLOW, ...(q.workflow ?? {}) });
      // Same instructions and tools as the route; no execution and no repair, so we see the raw first call.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { repairToolCall, stopWhen, ...setup } = await chatSetup({ workflow, modelId: model, execute: false });
      const abort = new AbortController();
      const t0 = performance.now();
      const r: CaseResult = { question: q.question, expected_skill: q.expected_skill, actual_skill: null, correct: false, args_ok: null, input_valid: null, input: null, ttft_ms: null, tool_call_ms: null, total_ms: 0 };
      let text = "";
      try {
        const result = streamText({ ...setup, stopWhen: isStepCount(1), prompt: q.question, abortSignal: abort.signal });
        for await (const part of result.stream) {
          const t = Math.round(performance.now() - t0);
          if (r.ttft_ms == null && ["text-delta", "reasoning-delta", "tool-input-start", "tool-call"].includes(part.type)) r.ttft_ms = t;
          if (part.type === "text-delta") text += part.text;
          if (part.type === "error") throw part.error;
          if (part.type === "tool-call") {
            r.actual_skill = part.toolName;
            r.input = part.input;
            r.input_valid = !(part as { invalid?: boolean }).invalid;
            r.tool_call_ms = t;
            abort.abort();
            break;
          }
        }
      } catch (e) {
        if (!abort.signal.aborted) r.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
      }
      r.total_ms = Math.round(performance.now() - t0);
      r.correct = r.actual_skill === q.expected_skill && !r.error;
      r.args_ok = r.correct ? argsMatch(q.expected_args, r.input) : q.expected_args ? false : null;
      if (!r.actual_skill) r.text = text.slice(0, 200);
      results.push(r);
      const mark = r.correct ? "ok  " : "MISS";
      console.log(
        `${String(i + 1).padStart(2)} ${mark} ${(r.actual_skill ?? "(none)").padEnd(18)} exp ${(q.expected_skill ?? "(none)").padEnd(18)} ttft ${String(r.ttft_ms ?? "-").padStart(6)} ms  ${r.args_ok === false ? "args!" : "     "} ${q.question.slice(0, 70)}${r.error ? `  ERROR ${r.error}` : ""}`,
      );
    }
    const correct = results.filter((r) => r.correct).length;
    const ttfts = results.map((r) => r.ttft_ms).filter((x): x is number => x != null);
    const withArgs = results.filter((r) => r.args_ok != null);
    const summary = {
      model,
      base_url: LLM_BASE_URL,
      questions: results.length,
      correct,
      accuracy: results.length ? Math.round((1000 * correct) / results.length) / 10 : 0,
      args_correct: `${withArgs.filter((r) => r.args_ok).length}/${withArgs.length}`,
      invalid_inputs: results.filter((r) => r.input_valid === false).length,
      errors: results.filter((r) => r.error).length,
      ttft_ms: { median: pct(ttfts, 50), p90: pct(ttfts, 90), mean: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null },
    };
    console.log(`\n${model}: ${correct}/${results.length} correct (${summary.accuracy}%), args ${summary.args_correct}, TTFT median ${summary.ttft_ms.median} ms, p90 ${summary.ttft_ms.p90} ms`);
    runs.push({ ...summary, results });
  }
  const out = { ran_at: new Date().toISOString(), runs };
  writeFileSync(path.join(here, "last-run.json"), JSON.stringify(out, null, 1) + "\n");
  console.log(`\nWrote ${path.relative(root, path.join(here, "last-run.json"))}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
