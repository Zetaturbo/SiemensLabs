# frontend (workstream A)

Next.js app: train map, sourcing cases (explorer, shortlist board, finalists, memo) and the chat with generative UI.

## Run

```bash
cp .env.example .env          # fill LLM_API_KEY; keep DATA_API_MOCK=1 until the data service runs
pnpm install
pnpm dev                      # http://localhost:3000
pnpm typecheck
```

Model file: download the Velaro-class GLB (see `public/models/CREDITS.md`) to `public/models/train.glb`.

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
  data-api/              client with mock switch, types mirroring ARCHITECTURE.md, mocks/
  llm/                   OpenAI-compatible provider (Nebius / NVIDIA switch)
  openui/                component library + prompt section
  cases/                 shared case state (zustand) + seed data
  results/               result-handle store (server)
src/config/train-parts.json   13 hotspots with profile per part
evals/routing/           routing eval questions + runner
public/models/           train.glb + CREDITS.md
```

## Conventions

- Scores: 0 = no risk, 100 = max risk for the 19 score columns; delivery_rating and order_confirmation_rate are higher-is-better.
- Field names follow `api/ARCHITECTURE.md` (financial_health, credit_rating, total_risk_index, quality_risk_level).
- Numbers never pass through the model: skills store results, components fetch by handle.
- Next.js 16: read `node_modules/next/dist/docs/` before using an API from memory (see AGENTS.md).
