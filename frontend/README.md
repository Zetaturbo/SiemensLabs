# frontend (workstream A)

Next.js app: train map, sourcing cases (explorer, shortlist board, finalists, memo) and the chat with generative UI.

## Run

```bash
cp .env.example .env          # fill LLM_API_KEY; DATA_API_MOCK=0 to use the data service (see "Data sources")
pnpm install
pnpm dev                      # http://localhost:3000
pnpm typecheck
```

Model file: download the Velaro-class GLB (see `public/models/CREDITS.md`) to `public/models/train.glb`.

## Data sources

Skills (chat) and screens (`POST /api/data/:tool`) both go through `callDataTool` in `src/lib/data-api/client.ts`,
which resolves every call in this order:

1. **live**: the data service (`api/`) at `POST {DATA_API_URL}/tools/<tool>`, 3 s timeout. Used when `DATA_API_URL` is
   set and `DATA_API_MOCK` is not `1`. A live answer with `ok: false` (unknown supplier, bad filter) is returned as is.
2. **engine**: on connection error, timeout, HTTP 404 (tool not built in the service yet) or a response that is not an
   envelope, the request-time engine (`src/app/api/data/_engine/engine.ts`) computes the tool from
   `../data/supplier_risk_dataset.csv`. With `DATA_API_MOCK=1` it is the first step.
3. **mock**: when the engine does not cover the tool (`find_similar`), the static file
   `src/lib/data-api/mocks/<tool>.json`, which answers one fixed input only (`meta.mock_input`).

`run_sql` is the exception: it has no engine, and its static mock is one canned table, so without the live service it
returns `ok: false` with code `NOT_AVAILABLE` ("run_sql needs the live data service (DATA_API_URL)") and the model is
told the query could not run.

Every envelope carries `meta.source` = `live` | `engine` | `mock` (engine answers also carry `meta.engine_pool`), and each
fallback logs one line, e.g. `[data-api] explain_supplier: live -> engine (404, tool not built in the service)`.

```bash
pnpm check:data                                                      # every tool once: tool, source, ok
DATA_API_MOCK=0 DATA_API_URL=http://localhost:8000 pnpm check:data   # against the running service
```

## Research

Web research on real companies runs in the research service (`research/`, Python, port 8001). The frontend calls it at
`POST {RESEARCH_API_URL}/tools/<tool>` (`src/lib/research/client.ts`, envelope `{ok, data, meta, error}`) and uses
`research_company`, `get_research_status`, `confirm_entity`, `get_research_report` and `list_research_jobs`.

| Mode | When | What runs |
| --- | --- | --- |
| live | `RESEARCH_API_URL` set | the service: registry lookup (GLEIF), four lane agents on closed source lists (Tavily), quote check, verifier, report from verified claims; 40 to 70 s a run |
| replay | `RESEARCH_API_URL` empty | the recorded live Knorr-Bremse run of 2026-10-18 (`src/lib/research/replay-knorr-bremse.json`, copied from `mocks/research_report_knorr_bremse.json`); other companies fail with a clear message |

Run both side by side:

```bash
cd research && cp .env.example .env    # TAVILY_API_KEY, NEBIUS_API_KEY, LLM_* (see research/README.md); no Postgres needed
scripts/serve.sh                       # :8001, check: curl localhost:8001/health (lists the six tools)
cd ../frontend && RESEARCH_API_URL=http://localhost:8001 pnpm dev
```

Jobs live in the service's file store (`research/var/jobs`, `RESEARCH_STORE_DIR`), so `/research` keeps its history across
restarts. For replay mode leave `RESEARCH_API_URL` unset or empty in `.env`; do not export it as an empty variable on the
command line while `.env` also sets it (Next dev then reloads the page in a loop).

- **Skill** `research_company`: sends `auto_confirm: true` (several registry matches: the best one is used; pass
  `auto_confirm: false` to let the buyer pick from `candidates`, answered with `confirm_entity`). A dataset supplier
  (`SUPP_`/`BRK_` id or its invented name) is researched as its linked company from `RESEARCH_LINKS` in
  `src/lib/cases/seed.ts` (brakes case: SUPP_03267 Knorr-Bremse, SUPP_09772 Wabtec, SUPP_01995 Akebono; BRK_0049 and
  BRK_0029 map to the service's simulated sandbox twins). Without a link the service refuses it (`SYNTHETIC_ENTITY`), and
  the block shows that refusal as one sentence; replay mode applies the same rule.
- **Block** `RiskFlagList`: progress while running, candidates when the entity is ambiguous, then overall assessment,
  category assessments, flags (every one verified, with source links and its claim count) and the run's claim totals.
  `SourceList` lists the report's sources.
- **Page** `/research`: `list_research_jobs` (replay run when the service is absent or does not answer); a row opens the
  job's progress and report; "New research" starts a job.
- Contract details and open mismatches with the service: `docs/research-contract-notes.md`.

## Structure

```
src/app/                 routes: / , /train , /cases/[caseId] , api/chat , api/results/[id] , api/cases
src/skills/              skill registry: one file per skill (tool for the model + run + summarize + view)
src/components/
  ui-blocks/             OpenUI components the model composes (fetch by resultId)
  train/                 blueprint 3D scene, hotspots, part panel, filter bar
  chat/                  chat panel (useChat + OpenUI Renderer + ui_actions)
  explorer/              long list: filters, table, Kraljic matrix
  shortlist/             shortlist board, finalists, supplier drawer, memo
src/lib/
  data-api/              client (live -> engine -> mock), types mirroring ARCHITECTURE.md, mocks/, check.ts (pnpm check:data)
  llm/                   provider (NVIDIA / Nebius switch), skills -> tools, repair, chat setup, answer check, protocol types
  prompt/                system prompt builder, get_metadata cache, OpenUI prompt snapshot (pnpm gen:openui)
  research/              research job client (live via RESEARCH_API_URL, replay of a recorded Knorr-Bremse run)
  openui/                component library + prompt section
  cases/                 shared case state (zustand) + seed data
  results/               result-handle store (server)
src/config/train-parts.json   13 hotspots with profile per part
evals/routing/           routing eval questions + runner
evals/answers/           answer eval against data/eval/supplier_risk_eval_v1.jsonl (runner, grader, results)
public/models/           train.glb + CREDITS.md
```

## Conventions

- Scores: 0 = no risk, 100 = max risk for the 19 score columns; delivery_rating and order_confirmation_rate are higher-is-better.
- Field names follow `api/ARCHITECTURE.md` (financial_health, credit_rating, total_risk_index, quality_risk_level).
- Numbers never pass through the model: skills store results, components fetch by handle.
- Next.js 16: read `node_modules/next/dist/docs/` before using an API from memory (see AGENTS.md).

## Chat protocol

`POST /api/chat` runs one copilot turn and streams an AI SDK v7 UI message stream (SSE), which `useChat` from
`@ai-sdk/react` consumes directly. Types live in `src/lib/llm/protocol.ts` (client-safe): `ChatUIMessage`, `ChatDataParts`, `ChatRequestBody`.

### Request

```ts
// body
{ messages: ChatUIMessage[], workflow: WorkflowContext }   // WorkflowContext: src/skills/types.ts (ARCHITECTURE.md section 7)

// client
const { messages, sendMessage } = useChat<ChatUIMessage>({
  transport: new DefaultChatTransport({ api: "/api/chat", body: () => ({ workflow: currentWorkflow() }) }),
  onData: (part) => { if (part.type === "data-ui-actions") applyUiActions(part.data.actions); },
});
```

The workflow is parsed leniently: missing fields fall back to defaults. Errors: 400 for a body without `messages`, 503 without `LLM_API_KEY`.

`workflow.view` (optional, `ViewContext` in `src/skills/types.ts`) tells the model what the buyer sees: ids and labels only, never data values.

```ts
view: { screen: "case chat",
        blocks: [{ component: "RankedList", result_id: "filter_1a2b3c4d", label?: "suppliers matching the filters", visible_ids?: ["SUPP_00609", ...] }],  // most recent first, max 5, max 20 ids
        filters_shown?: ["Quality: not Critical", "Delivery > 95 %"],   // filter chip texts
        draft_inputs?: { "owner": "Lena K." } }                         // unsaved form fields, never the composer
```

ChatPanel fills `blocks` from the OpenUI programs it rendered; each block reports the supplier ids it shows (`WithResult` -> `BlockEnv.report`).
The page passes `screen`, `filters_shown` and `draft_inputs` (`<ChatPanel view>`). The route parses it with `parseView` (caps, id and handle
patterns, digits dropped from labels) and the system prompt prints it as "# What the buyer sees now" with the rule that "the top 3",
"this table", "the ones shown" resolve to the visible ids.

### Parts of the assistant message, in stream order

| Part | When | Use |
|---|---|---|
| `step-start` | each model step (max 3) | |
| `tool-<skill>` (e.g. `tool-compare_suppliers`) | per skill call; `state` goes `input-streaming` -> `input-available` -> `output-available` (or `output-error`) | show "running compare_suppliers"; `output` is `SkillToolOutput`: `{ skill, handle, summary, view, ui_actions }` |
| `data-ui-actions` | right after a skill that requests UI changes | `{ tool_call_id, skill, actions: UiAction[] }`; apply in `onData` (fires once, while streaming). Also kept in `message.parts`, so do not re-apply on reload |
| `text` | final step | prose, then one fenced `openui-lang` block. Reasoning is never streamed (`sendReasoning: false`) |
| `data-answer` | once, last, id `answer` | `{ prose, openui, source, issues }`: **render this**. `prose` is Markdown for the bubble, `openui` is the OpenUI Lang program for `<Renderer response={openui} library={library} />` (null = prose only) |

`data-answer.source` is `"model"` when the model's program was used, `"fallback"` when the server replaced it with the
deterministic default view of the last skill (the program failed to parse, used named arguments, or referenced an unknown
handle), and `"none"` when there is nothing to render. `issues` lists what was wrong with the model's program. While
streaming, before `data-answer` arrives, `splitAssistantText(text)` from `src/lib/llm/answer.ts` splits the text part into
`{ prose, code }` for a progressive render.

Message metadata: `{ model }` on start, `{ model, finish_reason, steps }` on finish.

### ui_actions (`UiAction` in `src/skills/types.ts`)

```ts
{ type: "add_to_shortlist", ids: string[] }          { type: "remove_from_shortlist", ids: string[] }
{ type: "set_profile", profile_id: string }          { type: "open_supplier", id: string }
{ type: "open_compare", ids?: string[] }             { type: "set_case_stage", case_id: string, stage: "long_list" | "shortlist" | "finalists" | "awarded" }
{ type: "assign_part", part_id: string, owner: { name: string, department: string } }
{ type: "start_research", job_id: string, company_name: string, result_id: string, supplier_id?: string }
{ type: "set_hard_requirements", conditions: FilterCondition[] }   // full list; replaces the case's filters
```

Sources: `update_workflow` (buyer asked for a change), `filter_suppliers` (`set_hard_requirements` when its filters differ from the case's), `rank_with_profile` (`set_profile` when it ranked with another profile),
`explain_supplier` (`open_supplier`), `research_company` (`start_research`).

### Result handles

Skills store full results server-side (`src/lib/results/store.ts`) and hand the model only `summary` and the handle
(`cmp_1a2b3c4d`, `explain_...`, `filter_...`, `rank_...`, `sql_...`, `research_...`, `memo_...`, `similar_...`).
Components fetch `GET /api/results/:handle`. Payload shapes per skill: `src/skills/README.md`. Research handles hold a live job
state: poll until `status` is `done` or `failed` (`report` is then filled). `GET /api/research/:jobId` returns the same state;
`POST /api/research` starts a job from the UI (`{ company_name, country?, website?, supplier_id?, auto_confirm? }` ->
`{ job_id, result_id }`, or 422 `{ error, code, result_id }` when the service refuses); `GET /api/research` lists jobs
(`{ mode, jobs, error? }`).

### Other endpoints

- `GET /api/chat`: `{ model, max_steps, skills: [{ name, description, priority, stage, examples }] }` for suggestion chips
  (client components cannot import the server-only skill registry).

### Model, prompt, OpenUI

- Model: `LLM_MODEL` (default `nvidia/nemotron-3-ultra-550b-a55b`, fallback `nvidia/nemotron-3-super-120b-a12b`) on `LLM_BASE_URL`.
  Temperature 0, max 3 steps, one repair retry on invalid tool input, reasoning off (`LLM_REASONING=on` to enable).
- System prompt (`src/lib/prompt/system-prompt.ts`): rules, workflow context of the turn, skill routing table with worked
  examples, field metadata from `get_metadata`, answer format, OpenUI prompt section.
- OpenUI arguments are positional: `root = Verdict("cmp_1a2b3c4d")`.
- Route handlers run on React's react-server build, where `@openuidev/react-lang` fails at import, so the server uses a
  snapshot of the library's prompt section and JSON schema: `src/lib/prompt/openui.generated.json`, written by `pnpm gen:openui`
  (runs before `dev`, `build` and `eval:routing`). Re-run it after changing `src/lib/openui/library.tsx`.
- Routing eval: `pnpm eval:routing` (see `evals/routing/README.md`).
- Answer eval: `pnpm eval:answers` (see `evals/answers/README.md`).
