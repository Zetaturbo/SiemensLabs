/**
 * Routing eval: sends each question through the model with the same system prompt and tools as
 * POST /api/chat (via chatSetup), compares the first tool call to expected_skill, and reports
 * accuracy, argument matches and time to first token.
 *
 *   pnpm eval:routing                                     # model from LLM_MODEL, questions.json
 *   pnpm eval:routing --model a,b                         # several models, one after the other
 *   pnpm eval:routing --questions path/to/set.jsonl       # .json array or .jsonl, see README
 *   pnpm eval:routing --full                              # also run the skills (mocks) and record the final answer
 *   pnpm eval:routing --only compare_suppliers --limit 5
 *
 * Writes evals/routing/results/<model>.json per model and evals/routing/last-run.json (all models).
 */
import Module from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
const cwd = process.cwd();
process.chdir(root); // data-api mocks are resolved from process.cwd()
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));
process.env.DATA_API_MOCK ??= "1";

interface Question {
  question: string;
  /** Skill expected as the first tool call; null = expect no tool call; absent = not graded for routing. */
  expected_skill?: string | null;
  /** Alias used by generated eval sets (ARCHITECTURE.md section 9). */
  expected_tool?: string | null;
  expected_args?: Record<string, unknown>;
  workflow?: Record<string, unknown>;
  id?: string;
  [extra: string]: unknown;
}

interface CaseResult {
  id?: string;
  question: string;
  expected_skill: string | null | undefined;
  actual_skill: string | null;
  correct: boolean | null;
  args_ok: boolean | null;
  input_valid: boolean | null;
  input: unknown;
  ttft_ms: number | null;
  tool_call_ms: number | null;
  total_ms: number;
  text?: string;
  error?: string;
  /** --full only */
  tool_calls?: Array<{ skill: string; input: unknown; summary?: string; error?: string }>;
  final_text?: string;
  answer?: unknown;
  /** Extra fields of the question (ground truth etc.), passed through for graders. */
  question_meta?: Record<string, unknown>;
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

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

function loadQuestions(file: string): Question[] {
  const raw = readFileSync(file, "utf8");
  const items = file.endsWith(".jsonl") ? raw.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l)) : JSON.parse(raw);
  return (items as Question[]).map((q) => ({ ...q, expected_skill: q.expected_skill !== undefined ? q.expected_skill : q.expected_tool }));
}

const safeName = (model: string) => model.replace(/[^A-Za-z0-9._-]+/g, "__");

async function main() {
  if (!process.env.LLM_API_KEY) {
    console.log("LLM_API_KEY is not set (frontend/.env). Skipping the routing eval.");
    return;
  }
  const { streamText, isStepCount } = await import("ai");
  const { chatSetup, parseWorkflow, MAX_STEPS } = await import("../../src/lib/llm/chat");
  const { MODEL_ID, LLM_BASE_URL, REASONING } = await import("../../src/lib/llm/provider");
  const { buildAnswerPart } = await import("../../src/lib/llm/check-answer");

  const qFile = arg("questions") ? path.resolve(cwd, arg("questions")!) : path.join(here, "questions.json");
  let questions = loadQuestions(qFile);
  const only = arg("only");
  if (only) questions = questions.filter((q) => q.expected_skill === only);
  const limit = Number(arg("limit") ?? 0);
  if (limit > 0) questions = questions.slice(0, limit);
  const full = flag("full");
  const models = (arg("model") ?? MODEL_ID).split(",").map((m) => m.trim()).filter(Boolean);
  const resultsDir = path.join(here, "results");
  mkdirSync(resultsDir, { recursive: true });
  const runs = [];

  for (const model of models) {
    console.log(`\n== ${model} @ ${LLM_BASE_URL} : ${questions.length} questions from ${path.relative(root, qFile)}${full ? " (full turns)" : ""} ==`);
    const results: CaseResult[] = [];
    for (const [i, q] of questions.entries()) {
      const { question, expected_skill, expected_tool, expected_args, workflow: wfOverride, id, ...meta } = q;
      void expected_tool;
      const workflow = parseWorkflow({ ...EVAL_WORKFLOW, ...(wfOverride ?? {}) });
      const outputs: Array<import("../../src/skills/types").SkillToolOutput> = [];
      const setup = await chatSetup({ workflow, modelId: model, execute: full, onOutput: (o) => outputs.push(o) });
      // Routing mode: no execution and no repair, so we see the raw first call.
      const { repairToolCall, ...routingSetup } = setup;
      const abort = new AbortController();
      const t0 = performance.now();
      const r: CaseResult = {
        id,
        question,
        expected_skill,
        actual_skill: null,
        correct: null,
        args_ok: null,
        input_valid: null,
        input: null,
        ttft_ms: null,
        tool_call_ms: null,
        total_ms: 0,
        question_meta: Object.keys(meta).length ? meta : undefined,
      };
      let text = "";
      let stepText = "";
      try {
        const result = full
          ? streamText({ ...setup, prompt: question, abortSignal: abort.signal })
          : streamText({ ...routingSetup, stopWhen: isStepCount(1), prompt: question, abortSignal: abort.signal });
        void repairToolCall;
        for await (const part of result.stream) {
          const t = Math.round(performance.now() - t0);
          if (r.ttft_ms == null && ["text-delta", "reasoning-delta", "tool-input-start", "tool-call"].includes(part.type)) r.ttft_ms = t;
          if (part.type === "start-step") stepText = "";
          if (part.type === "text-delta") {
            text += part.text;
            stepText += part.text;
          }
          if (part.type === "error") throw part.error;
          if (part.type === "tool-call") {
            if (r.actual_skill == null) {
              r.actual_skill = part.toolName;
              r.input = part.input;
              r.input_valid = !(part as { invalid?: boolean }).invalid;
              r.tool_call_ms = t;
            }
            if (full) (r.tool_calls ??= []).push({ skill: part.toolName, input: part.input });
            else {
              abort.abort();
              break;
            }
          }
          if (full && part.type === "tool-error") {
            const tc = r.tool_calls?.findLast((c) => c.skill === part.toolName);
            if (tc) tc.error = String(part.error instanceof Error ? part.error.message : part.error).slice(0, 300);
          }
        }
      } catch (e) {
        if (!abort.signal.aborted) r.error = e instanceof Error ? e.message.slice(0, 300) : String(e);
      }
      r.total_ms = Math.round(performance.now() - t0);
      if (expected_skill !== undefined) r.correct = r.actual_skill === expected_skill && !r.error;
      r.args_ok = r.correct ? argsMatch(expected_args, r.input) : expected_args && r.correct === false ? false : null;
      if (full) {
        for (const tc of r.tool_calls ?? []) tc.summary = outputs.find((o) => o.skill === tc.skill)?.summary;
        r.final_text = stepText;
        r.answer = buildAnswerPart(stepText, outputs);
      } else if (!r.actual_skill) r.text = text.slice(0, 300);
      results.push(r);
      const mark = r.correct == null ? "    " : r.correct ? "ok  " : "MISS";
      console.log(
        `${String(i + 1).padStart(3)} ${mark} ${(r.actual_skill ?? "(none)").padEnd(18)} exp ${String(expected_skill === undefined ? "-" : (expected_skill ?? "(none)")).padEnd(18)} ttft ${String(r.ttft_ms ?? "-").padStart(6)} ms  ${r.args_ok === false ? "args!" : "     "} ${question.slice(0, 70)}${r.error ? `  ERROR ${r.error}` : ""}`,
      );
    }
    const graded = results.filter((r) => r.correct != null);
    const correct = graded.filter((r) => r.correct).length;
    const ttfts = results.map((r) => r.ttft_ms).filter((x): x is number => x != null);
    const withArgs = results.filter((r) => r.args_ok != null);
    const summary = {
      model,
      base_url: LLM_BASE_URL,
      reasoning: REASONING ? "on" : "off",
      mode: full ? `full turns (max ${MAX_STEPS} steps, mock data)` : "first tool call",
      questions_file: path.relative(root, qFile),
      questions: results.length,
      graded: graded.length,
      correct,
      accuracy: graded.length ? Math.round((1000 * correct) / graded.length) / 10 : null,
      args_correct: `${withArgs.filter((r) => r.args_ok).length}/${withArgs.length}`,
      invalid_inputs: results.filter((r) => r.input_valid === false).length,
      errors: results.filter((r) => r.error).length,
      ttft_ms: { median: pct(ttfts, 50), p90: pct(ttfts, 90), mean: ttfts.length ? Math.round(ttfts.reduce((a, b) => a + b, 0) / ttfts.length) : null },
      ran_at: new Date().toISOString(),
    };
    console.log(
      `\n${model}: ${correct}/${graded.length} correct (${summary.accuracy ?? "n/a"}%), args ${summary.args_correct}, TTFT median ${summary.ttft_ms.median} ms, p90 ${summary.ttft_ms.p90} ms`,
    );
    const run = { ...summary, results };
    writeFileSync(path.join(resultsDir, `${safeName(model)}.json`), JSON.stringify(run, null, 1) + "\n");
    console.log(`Wrote ${path.relative(root, path.join(resultsDir, `${safeName(model)}.json`))}`);
    runs.push(run);
  }
  writeFileSync(path.join(here, "last-run.json"), JSON.stringify({ ran_at: new Date().toISOString(), runs }, null, 1) + "\n");
  console.log(`Wrote ${path.relative(root, path.join(here, "last-run.json"))}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
