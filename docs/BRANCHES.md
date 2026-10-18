# Branches and how work lands

`integration` is the trunk: the demo runs from it and every branch merges into it. `main` is fast-forwarded from
`integration` at milestones by the supervisor. Branch from `integration`, keep branches small, merge often.

## Naming

`<area>/<topic>` in kebab-case, where area is the folder you change:

| Area | Folder | Examples |
| --- | --- | --- |
| `frontend` | `frontend/` | `frontend/chat-first-case`, `frontend/train-map-polish` |
| `research` | `research/` | `research/job-tools`, `research/report-sources` |
| `api` | `api/` | `api/offerings-tool` |
| `db` | `db/` | `db/offerings-migration` |
| `data` | `data/` | `data/brake-eval-v2` |
| `docs` | `docs/` | `docs/demo-script` |

Existing `feat/*`, `feature/*` and `fix/*` branches keep their names until merged. One topic per branch; a branch
that changes two areas is named after the one that matters and says so in its description.

## Pull requests

Every branch lands through a pull request into `integration` (teammates and builders alike). The supervisor opens the
PR for builder branches with the brief's summary and the check results, and merges once the four checks pass; it
reviews teammates' PRs for conflicts with the frontend and merges them when clean, or comments what blocks them.
Reviews are welcome but do not block during the hackathon. `main` is fast-forwarded from `integration` at milestones.

## Before you merge into integration

- `frontend/`: `pnpm exec next typegen && pnpm exec tsc --noEmit && pnpm lint && pnpm build`.
- `api/`, `research/`: `uv run pytest` in the service folder.
- Tell the supervisor session the branch name; it verifies, merges and reports.

## Contracts between areas

- Data service: `api/README.md` and `docs/ARCHITECTURE.md` section 5. Frontend types in `frontend/src/lib/data-api/types.ts`.
- Research service: `docs/ARCHITECTURE.md` section 6 and `docs/SPEC.md`. Frontend types in
  `frontend/src/lib/research/types.ts`; the frontend calls `POST {RESEARCH_API_URL}/tools/<tool>` for
  `research_company`, `get_research_status`, `confirm_entity`, `get_research_report`, and plays a canned replay when
  `RESEARCH_API_URL` is empty. To test the real service in the frontend: run it on port 8001, set
  `RESEARCH_API_URL=http://localhost:8001` in `frontend/.env`, open the brake case, pin a supplier and ask
  "research Knorr-Bremse" (or use the research action in the finalists flow). The chat polls the job until `done`
  and renders the report; the shapes in `types.ts` are what the renderer reads.
- Chat protocol: `frontend/README.md`.
