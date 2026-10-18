/**
 * Answer eval: runs each question of the team's ground-truth set through the real chat logic (chatSetup:
 * same system prompt, skills, model and call settings as POST /api/chat), executes the skills against the
 * data layer (live service -> engine -> static mock, see src/lib/data-api/client.ts), captures the final
 * prose and the tool outputs, and grades with the item's evaluation.method (./grade.ts).
 *
 *   pnpm eval:answers                                              # LLM_MODEL, data/eval/supplier_risk_eval_v1.jsonl
 *   DATA_API_MOCK=0 DATA_API_URL=http://localhost:8000 pnpm eval:answers
 *   pnpm eval:answers --model <id> --concurrency 2 --limit 10 --only count --ids SRE-0001,SRE-0002
 *   pnpm eval:answers --regrade                                    # re-grade results/<model>.json, no model calls
 *   pnpm eval:answers --retry-errors                               # re-run errored (e.g. 429) or missing items and merge
 *   pnpm eval:answers --self-test                                  # grade each ground_truth_answer (grader check)
 *
 * Writes evals/answers/results/<model>.json (<model>.subset.json for --only / --ids / --limit): summary by
 * category, difficulty and method, plus one row per item.
 */
import Module from "node:module";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { grade, type EvalItem, type Grade } from "./grade";

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, "../..");

// Next.js resolves "server-only" itself; in plain Node it is not installed (same shim as the routing eval).
const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (request: string, ...rest: unknown[]) {
  if (request === "server-only") return path.join(root, "evals/routing/server-only-shim.cjs");
  return resolveFilename.call(this, request, ...rest);
};

const cwd = process.cwd();
process.chdir(root); // mocks and the engine resolve paths from process.cwd()
// Values already in the environment (command line) win over .env.
if (existsSync(path.join(root, ".env"))) process.loadEnvFile(path.join(root, ".env"));

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const flag = (name: string) => process.argv.includes(`--${name}`);

interface ToolCallRecord {
  skill: string;
  input: unknown;
  summary?: string;
  handle?: string;
  error?: string;
}

interface ItemResult {
  id: string;
  category: string;
  difficulty: string;
  method: string;
  question: string;
  pass: boolean | null;
  score: number | null;
  detail: string;
  /** graded on the prose alone, without the tool summaries */
  pass_prose_only: boolean | null;
  key_points?: Grade["key_points"];
  prose: string;
  tool_calls: ToolCallRecord[];
  data_calls: Array<{ tool: string; source: string; ok: boolean; ms: number }>;
  openui: string | null;
  answer_source: string;
  steps: number;
  attempts: number;
  total_ms: number;
  error?: string;
  ground_truth_answer: string;
}

const safeName = (model: string) => model.replace(/[^A-Za-z0-9._-]+/g, "__");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const isRateLimit = (msg: string) => /\b429\b|rate.?limit|too many requests/i.test(msg);

function loadItems(file: string): EvalItem[] {
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvalItem);
}

/** Text a buyer sees: the prose plus the skill summaries (the rendered blocks show at least these numbers). */
const visibleText = (r: Pick<ItemResult, "prose" | "tool_calls">) => [r.prose, ...r.tool_calls.map((t) => t.summary ?? "")].join("\n");

function applyGrade(item: EvalItem, r: ItemResult): ItemResult {
  const g = grade(item, visibleText(r));
  const proseOnly = grade(item, r.prose);
  return { ...r, method: g.method, pass: r.error ? false : g.pass, score: r.error ? 0 : g.score, detail: r.error ? `error: ${r.error}` : g.detail, key_points: g.key_points, pass_prose_only: r.error ? false : proseOnly.pass };
}

function breakdown(results: ItemResult[], key: (r: ItemResult) => string) {
  const out: Record<string, { n: number; graded: number; passed: number; pass_rate: number | null; prose_only_passed: number }> = {};
  for (const r of results) {
    const k = key(r);
    const b = (out[k] ??= { n: 0, graded: 0, passed: 0, pass_rate: null, prose_only_passed: 0 });
    b.n++;
    if (r.pass !== null) b.graded++;
    if (r.pass) b.passed++;
    if (r.pass_prose_only) b.prose_only_passed++;
  }
  for (const b of Object.values(out)) b.pass_rate = b.graded ? Math.round((1000 * b.passed) / b.graded) / 10 : null;
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1].n - a[1].n));
}

function summarize(results: ItemResult[], extra: Record<string, unknown>) {
  const graded = results.filter((r) => r.pass !== null);
  const passed = graded.filter((r) => r.pass).length;
  const sources: Record<string, number> = {};
  for (const r of results) for (const d of r.data_calls) sources[`${d.tool}:${d.source}`] = (sources[`${d.tool}:${d.source}`] ?? 0) + 1;
  const skills: Record<string, number> = {};
  for (const r of results) {
    const first = r.tool_calls[0]?.skill ?? "(none)";
    skills[first] = (skills[first] ?? 0) + 1;
  }
  return {
    ...extra,
    questions: results.length,
    graded: graded.length,
    passed,
    pass_rate: graded.length ? Math.round((1000 * passed) / graded.length) / 10 : null,
    prose_only_passed: results.filter((r) => r.pass_prose_only).length,
    errors: results.filter((r) => r.error).length,
    by_category: breakdown(results, (r) => r.category),
    by_difficulty: breakdown(results, (r) => r.difficulty),
    by_method: breakdown(results, (r) => r.method),
    first_skill: Object.fromEntries(Object.entries(skills).sort((a, b) => b[1] - a[1])),
    data_sources: Object.fromEntries(Object.entries(sources).sort()),
  };
}

function printSummary(s: ReturnType<typeof summarize>) {
  console.log(`\n${s.passed}/${s.graded} passed (${s.pass_rate}%), prose only ${s.prose_only_passed}, errors ${s.errors}`);
  for (const [title, b] of [
    ["category", s.by_category],
    ["difficulty", s.by_difficulty],
    ["method", s.by_method],
  ] as const) {
    console.log(`\nby ${title}`);
    for (const [k, v] of Object.entries(b)) console.log(`  ${k.padEnd(22)} ${String(v.passed).padStart(3)}/${String(v.graded).padEnd(3)} ${String(v.pass_rate ?? "-").padStart(5)}%   prose only ${v.prose_only_passed}`);
  }
}

async function main() {
  const qFile = arg("questions") ? path.resolve(cwd, arg("questions")!) : path.resolve(root, "../data/eval/supplier_risk_eval_v1.jsonl");
  let items = loadItems(qFile);
  const only = arg("only");
  if (only) items = items.filter((q) => q.category === only || q.evaluation.method === only || q.difficulty === only);
  const ids = arg("ids")?.split(",").map((s) => s.trim());
  if (ids) items = items.filter((q) => ids.includes(q.id));
  const limit = Number(arg("limit") ?? 0);
  if (limit > 0) items = items.slice(0, limit);
  const resultsDir = path.join(here, "results");
  mkdirSync(resultsDir, { recursive: true });

  if (flag("self-test")) {
    const results = items.map((item) =>
      applyGrade(item, {
        id: item.id, category: item.category, difficulty: item.difficulty, method: item.evaluation.method, question: item.question,
        pass: null, score: null, detail: "", pass_prose_only: null, prose: item.ground_truth_answer, tool_calls: [], data_calls: [],
        openui: null, answer_source: "ground_truth", steps: 0, attempts: 0, total_ms: 0, ground_truth_answer: item.ground_truth_answer,
      }),
    );
    for (const r of results.filter((x) => x.pass === false)) console.log(`FAIL ${r.id} ${r.method}: ${r.detail}`);
    for (const r of results.filter((x) => x.pass === null)) console.log(`UNGRADED ${r.id} ${r.method}: ${r.detail}`);
    printSummary(summarize(results, { mode: "self-test: ground_truth_answer graded against itself" }));
    // Negative control: each item graded against the ground truth of the next item in the same category.
    let wrongPass = 0;
    let wrongGraded = 0;
    for (const item of items) {
      const peers = items.filter((q) => q.category === item.category);
      const other = peers[(peers.indexOf(item) + 1) % peers.length];
      if (other === item) continue;
      const g = grade(item, other.ground_truth_answer);
      if (g.pass !== null) wrongGraded++;
      if (g.pass) {
        wrongPass++;
        if (flag("verbose")) console.log(`  control pass ${item.id} ${item.category} ${g.method}: ${g.detail}`);
      }
    }
    console.log(`\nnegative control: ${wrongPass}/${wrongGraded} pass when graded against another same-category item's ground truth`);
    return;
  }

  const { MODEL_ID, LLM_BASE_URL, REASONING } = await import("../../src/lib/llm/provider");
  const model = arg("model") ?? MODEL_ID;
  // Subsets (--only / --ids / --limit) write a separate file so they never overwrite a full run.
  const subset = Boolean(only || ids || limit > 0);
  const outFile = path.join(resultsDir, `${safeName(model)}${subset ? ".subset" : ""}.json`);

  if (flag("regrade")) {
    const prev = JSON.parse(readFileSync(outFile, "utf8")) as { results: ItemResult[] } & Record<string, unknown>;
    const byId = new Map(loadItems(qFile).map((q) => [q.id, q]));
    const results = prev.results.map((r) => (byId.has(r.id) ? applyGrade(byId.get(r.id)!, r) : r));
    const { results: _old, ...head } = prev;
    void _old;
    const keep = Object.fromEntries(Object.entries(head).filter(([k]) => !["questions", "graded", "passed", "pass_rate", "prose_only_passed", "errors", "by_category", "by_difficulty", "by_method", "first_skill", "data_sources"].includes(k)));
    const summary = summarize(results, { ...keep, regraded_at: new Date().toISOString() });
    writeFileSync(outFile, JSON.stringify({ ...summary, results }, null, 1) + "\n");
    printSummary(summary);
    console.log(`Re-graded ${path.relative(root, outFile)}`);
    return;
  }

  if (!process.env.LLM_API_KEY) {
    console.log("LLM_API_KEY is not set (frontend/.env). Skipping the answer eval.");
    return;
  }

  // Preflight: one cheap request, so an unreachable endpoint fails once instead of once per question.
  const reach = await fetch(`${LLM_BASE_URL.replace(/\/+$/, "")}/models`, {
    headers: { authorization: `Bearer ${process.env.LLM_API_KEY}` },
    signal: AbortSignal.timeout(20_000),
  }).then(
    (r) => (r.status === 401 || r.status === 403 ? `HTTP ${r.status} (key rejected)` : null),
    (e: Error & { cause?: { code?: string | number; message?: string } }) =>
      `connection failed (${[e.cause?.code || null, e.cause?.message ?? e.message].filter(Boolean).join(": ")}; a proxy that refuses the host also ends up here)`,
  );
  if (reach) {
    console.error(`Cannot reach the LLM endpoint ${LLM_BASE_URL}: ${reach}. No results written.`);
    if (process.env.HTTPS_PROXY && process.env.NODE_USE_ENV_PROXY !== "1")
      console.error("HTTPS_PROXY is set but Node's fetch ignores it; rerun with NODE_USE_ENV_PROXY=1.");
    process.exit(1);
  }

  const { streamText } = await import("ai");
  const { chatSetup, parseWorkflow, MAX_STEPS } = await import("../../src/lib/llm/chat");
  const { buildAnswerPart } = await import("../../src/lib/llm/check-answer");
  const { splitAssistantText } = await import("../../src/lib/llm/answer");
  const { onDataCall, dataApiConfig } = await import("../../src/lib/data-api/client");

  // Attribute each data call to the question that made it (questions run concurrently).
  const current = new AsyncLocalStorage<ItemResult["data_calls"]>();
  onDataCall((e) => current.getStore()?.push(e));

  // --retry-errors: re-run only the rows of results/<model>.json that ended in an error, then merge them back.
  const retryErrors = flag("retry-errors");
  const previous = retryErrors ? (JSON.parse(readFileSync(outFile, "utf8")) as { results: ItemResult[] } & Record<string, unknown>) : null;
  const allItems = items;
  if (previous) {
    // errored rows, plus rows a partial file (written every 10 items) does not have yet
    const keep = new Set(previous.results.filter((r) => !r.error).map((r) => r.id));
    items = items.filter((q) => !keep.has(q.id));
  }

  const concurrency = Math.max(1, Number(arg("concurrency") ?? 2));
  const data = dataApiConfig();
  // A neutral workflow: the eval questions are standalone, so no hard requirements or shortlist leak into them.
  const workflow = parseWorkflow({});
  console.log(
    `== ${model} @ ${LLM_BASE_URL} : ${items.length} questions from ${path.relative(root, qFile)}, concurrency ${concurrency}, data ${data.live ? `live ${data.url} -> engine -> mock` : "engine -> mock"} ==`,
  );

  async function runOne(item: EvalItem): Promise<ItemResult> {
    const t0 = performance.now();
    let attempts = 0;
    for (;;) {
      attempts++;
      const r: ItemResult = {
        id: item.id, category: item.category, difficulty: item.difficulty, method: item.evaluation.method, question: item.question,
        pass: null, score: null, detail: "", pass_prose_only: null, prose: "", tool_calls: [], data_calls: [], openui: null,
        answer_source: "none", steps: 0, attempts, total_ms: 0, ground_truth_answer: item.ground_truth_answer,
      };
      const outputs: Array<import("../../src/skills/types").SkillToolOutput> = [];
      let stepText = "";
      try {
        await current.run(r.data_calls, async () => {
          const setup = await chatSetup({ workflow, modelId: model, execute: true, onOutput: (o) => outputs.push(o) });
          // Errors arrive as stream parts and are recorded below; skip the SDK's default console dump.
          const result = streamText({ ...setup, prompt: item.question, onError: () => {} });
          for await (const part of result.stream) {
            if (part.type === "start-step") {
              stepText = "";
              r.steps++;
            }
            if (part.type === "text-delta") stepText += part.text;
            if (part.type === "error") throw part.error;
            if (part.type === "tool-call") r.tool_calls.push({ skill: part.toolName, input: part.input });
            if (part.type === "tool-result") {
              const out = part.output as { summary?: string; handle?: string } | undefined;
              const tc = r.tool_calls.findLast((c) => c.skill === part.toolName && c.summary === undefined && !c.error);
              if (tc) {
                tc.summary = out?.summary;
                tc.handle = out?.handle;
              }
            }
            if (part.type === "tool-error") {
              const tc = r.tool_calls.findLast((c) => c.skill === part.toolName && !c.error);
              if (tc) tc.error = String(part.error instanceof Error ? part.error.message : part.error).slice(0, 300);
            }
          }
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (isRateLimit(msg) && attempts < 8) {
          const wait = Math.min(120_000, 5_000 * 2 ** (attempts - 1));
          console.log(`     ${item.id} rate limited, retry ${attempts} in ${wait / 1000} s`);
          await sleep(wait);
          continue;
        }
        r.error = msg.slice(0, 300);
      }
      const answer = buildAnswerPart(stepText, outputs);
      r.prose = answer.prose || splitAssistantText(stepText).prose;
      r.openui = answer.openui;
      r.answer_source = answer.source;
      r.total_ms = Math.round(performance.now() - t0);
      return applyGrade(item, r);
    }
  }

  const results: ItemResult[] = new Array(items.length);
  let next = 0;
  let done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await runOne(items[i]);
      const r = results[i];
      done++;
      // Partial results every 10 items (a fresh run only), so a crash or a stop keeps what was done.
      if (!previous && done % 10 === 0 && done < items.length) {
        const partial = results.filter(Boolean);
        writeFileSync(outFile, JSON.stringify({ partial: true, model, done, of: items.length, results: partial }, null, 1) + "\n");
      }
      const mark = r.pass == null ? "  ? " : r.pass ? " ok " : "FAIL";
      const src = [...new Set(r.data_calls.map((d) => d.source))].join("+") || "-";
      console.log(
        `${String(done).padStart(3)} ${mark} ${r.id} ${r.category.padEnd(20)} ${r.difficulty.padEnd(6)} ${(r.tool_calls.map((t) => t.skill).join(",") || "(none)").padEnd(28)} ${src.padEnd(12)} ${(r.total_ms / 1000).toFixed(1).padStart(5)} s  ${r.detail.slice(0, 90)}`,
      );
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));

  let all = results;
  if (previous) {
    const byId = new Map([...previous.results, ...results].map((r) => [r.id, r]));
    all = allItems.map((q) => byId.get(q.id)).filter((r): r is ItemResult => !!r);
  }
  const summary = summarize(all, {
    model,
    base_url: LLM_BASE_URL,
    reasoning: REASONING ? "on" : "off",
    mode: `full turns (max ${MAX_STEPS} steps), neutral workflow, graded on prose + skill summaries`,
    data: { DATA_API_URL: data.url || null, DATA_API_MOCK: process.env.DATA_API_MOCK ?? null, order: data.live ? "live -> engine -> mock" : "engine -> mock" },
    questions_file: path.relative(root, qFile),
    concurrency,
    ran_at: previous?.ran_at ?? new Date().toISOString(),
    ...(previous ? { errors_retried: { at: new Date().toISOString(), items: results.length } } : {}),
  });
  writeFileSync(outFile, JSON.stringify({ ...summary, results: all }, null, 1) + "\n");
  printSummary(summary);
  console.log(`\nWrote ${path.relative(root, outFile)}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
