# Supervisor handoff

Read this first, then `docs/briefs/README.md`. You take over as supervisor of the frontend workstream for the
TechEurope Berlin hackathon (Siemens "Smart Supplier Selection for Trains"). Marcel (marcel@yavio.ai) is the product
owner; he builds `frontend/`, teammates own `api/` (Python data service), `db/`, `research/`, `data/eval/`.

## Product in one paragraph
A procurement copilot for rail buyers. Home is a blueprint-style 3D train (`/train`); each part is a sourcing case
with a stage (long list, shortlist, finalists, awarded) and an owner. A case (`/cases/[caseId]`) is being redesigned
to be chat-first: a narrow context rail on the left, the chat on the right, every table or chart a generative UI
block inside the conversation, a chip bar showing applied filters. First end-to-end part: the brake system,
profile `safety_critical`, demo research company Knorr-Bremse. Concept doc (Claude Docs, read-only for you):
https://claude.ai/code/artifact/36a2436c-1089-4030-9ce2-d521b03f859b

## Architecture
- Skills (`frontend/src/skills`): one file per procurement question pattern; a tool the model calls, `run` hits the
  data API (never the LLM), `summarize` is the only text the model reads, `view` is a deterministic OpenUI Lang
  default. Numbers never pass through the model: results go to `src/lib/results/store.ts`, blocks fetch
  `/api/results/:id`. Nine skills exist; `what_matters` is planned (brief 01).
- Chat route `POST /api/chat` (Vercel AI SDK v7, OpenAI-compatible provider). Protocol in `frontend/README.md`.
- OpenUI (`@openuidev/react-lang`, lang-core): 12 blocks in `src/components/ui-blocks`, library in
  `src/lib/openui/library.tsx`. Args are POSITIONAL (`CompareGrid("res_1")`); `normalizeResponse` rewrites named
  args. `pnpm gen:openui` snapshots the prompt section; rerun after library changes.
- Case state: zustand store `src/lib/cases/store.ts` + `actions.ts`, seeded parts, localStorage persistence.
- Data: contract `docs/ARCHITECTURE.md` section 5. Resolution today: `DATA_API_MOCK=1` serves
  `src/lib/data-api/mocks/*.json` (real values computed from the CSV by `frontend/scripts/gen-mocks.py`); the
  screens' route `/api/data/[tool]` has an engine computing 7 tools from the CSV. Live service: `api/`
  (`POST /tools/<tool>`, 5 of 11 tools built). Brief 03 unifies these with per-tool fallback.
- Design system: vendored LegalWork (`src/design-system`, MIT). White/graphite, Inter, Geist Mono, risk colors only
  via `--risk-*`, blueprint palette `--bp-*`. No raw hex, no other component libraries.
- Model: `nvidia/nemotron-3-ultra-550b-a55b` on `https://integrate.api.nvidia.com/v1` (routing eval 30/30, first
  token under 1 s). Fallback `nvidia/nemotron-3-super-120b-a12b`. GLM models time out on the free tier; Kimi 404.
  Thinking off by default (`LLM_REASONING=on` re-enables).

## Branches
`integration` is the merge target and what the demo runs from. Merged into it: feat/frontend-scaffold,
feat/data-mocks, feat/design-system, feat/chat-skills, feat/ui-blocks-chat, feat/case-screens, feat/train-map,
fix/design-system-dark, main (api, db, data/eval). Open briefs (not started): `docs/briefs/01..03`.
`main` is the teammates' branch; merge `main` into `integration` regularly, never the reverse without Marcel.

## Decisions to respect
- Builders always run on Claude Opus 5.5; the supervisor session is Claude Fable 5.1. Pass the model explicitly when spawning.
- The architecture contract cited as `docs/ARCHITECTURE.md` is not in the repo; point builders at `frontend/README.md`,
  `frontend/src/skills/README.md`, `frontend/src/lib/data-api` and `api/README.md` instead until it is restored.
- TypeScript only in `frontend/`. The Python mock generator should move to `data/` at the next cleanup.
- Demo over generality: brakes first, then more parts via config.
- Hide the old dashboard screens for the demo (brief 01). Minimal UI, short labels, no sub-sentences.
- Verify every builder branch: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm lint && pnpm build`.
- Never kill processes you did not start. Never commit `.env` or keys. Credit the CC-BY train model.

## Known issues
- Canned Knorr-Bremse replay report states 2018 antitrust facts from model memory; replace with a real research run
  or verify and link primary sources before the demo.
- Kraljic: Medium sourcing risk counted as low (ARCHITECTURE.md recommended high); derived delivery/confirmation
  risks only reach ~35 of 100. Both flagged to the data owner.
- `Slider` thumb stays white by design; `Badge`/`StatusDot` have no custom color prop (inline `--risk-*` styles).

## Deliverables still open
Chat-first case screen (brief 01, plus the view-awareness addendum: the chat knows the screen, the rendered blocks
and their visible ids, the filter chips and draft inputs), minimal train map (brief 02), live data + answer eval
(brief 03), brake sourcing on the simulated brake dataset in `data/brakes` (brief 04, after 01 and 03), research agent
wiring in the finalists flow (teammate's `research/` service; contract `docs/ARCHITECTURE.md` section 6 plus the
replay mode in `src/lib/research`), jury login (Clerk or WorkOS AuthKit), deployment (Google Cloud or a VPS,
containers), README, 2-minute video script (see concept doc, demo script section), model comparison write-up for
the sponsors from `evals/routing/results` and `evals/answers/results`.
