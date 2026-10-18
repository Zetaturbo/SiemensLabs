# UI blocks (OpenUI components)

Trusted blocks the model composes in OpenUI Lang. Each takes a `resultId` (a skill's result handle) and
fetches the full payload from `GET /api/results/:id` through `useResult`, so the model never types numbers.
`/dev/blocks` renders every block against fixture results; the same page has the chat panel.

## Rules for OpenUI Lang

- **Arguments are positional** (lang-core 1.0.1): `CompareGrid("compare_1a2b3c4d")` renders,
  `CompareGrid(resultId="compare_1a2b3c4d")` is dropped as an excess argument. Skip an optional argument
  in the middle with `null`. `resultId` is the first argument of every data block.
- `normalizeResponse(src)` from `src/lib/openui/library.tsx` rewrites named (`key=value`, `key: value`)
  arguments to positional form. The chat panel applies it before every render.
- `Stack` is the library root; any block can also be the root on its own (`root = Memo("memo_1a2b3c4d")`).

## Blocks

| Block | Signature | Reads (result shape) | Example |
|---|---|---|---|
| Stack | `Stack(children, title?)` | none; children are the blocks below, top to bottom | `root = Stack([intro, grid])` |
| Text | `Text(content, tone?)` tone `default \| muted \| warning` | none; light Markdown | `intro = Text("Price is not in the dataset.", "warning")` |
| RankedList | `RankedList(resultId, title?, limit?)` | filter_suppliers `{ total_matching, suppliers[] }`, rank_with_profile `{ profile_id, ranking[] }` (profile score, rank change, top contributors), find_similar `{ reference, similar[] }` | `root = RankedList("filter_1a2b3c4d")` |
| CompareGrid | `CompareGrid(resultId, title?, fields?)` | compare_suppliers `{ suppliers[], per_field[] {best, worst, spread}, largest_differences[] }`; up to 20 columns; key rows first, "show all" for the rest | `root = CompareGrid("compare_1a2b3c4d", null, ["financial_health", "credit_rating"])` |
| Verdict | `Verdict(resultId, family?)` family `financial \| operational_quality \| compliance_governance \| external_environment \| supply_chain_structure \| overall` | compare_suppliers. Without `family` it shows the skill's server verdict (`result.verdict`, what the model narrates); with `family` it derives winner, deciding factor and caveats from `family_scores` + `per_field` | `root = Verdict("compare_1a2b3c4d")` |
| ContributionWaterfall | `ContributionWaterfall(resultId, limit?)` | explain_supplier `{ total_risk_index, dataset_mean, percentile, contributions[] {field, value, level, weight, contribution_vs_mean}, critical_fields[] }`; top `limit` (default 8) movers, rest grouped | `root = ContributionWaterfall("explain_1a2b3c4d")` |
| RadarProfile | `RadarProfile(resultId, supplierIds?, title?)` | compare_suppliers `family_scores[]` (one small single-series radar per supplier, max 6, no legend) | `root = RadarProfile("compare_1a2b3c4d")` |
| SupplierCard | `SupplierCard(resultId, supplierId?)` | explain_supplier, or any `{ suppliers[] }` / `{ ranking[] }` / `{ similar[] }` picked by `supplierId` | `root = SupplierCard("explain_1a2b3c4d")` |
| Memo | `Memo(resultId)` | shortlist_memo `{ title, markdown, source, unverified_numbers[] }`, or `{ title, summary, recommendation, sections[] {heading, body, bullets}, sources[] }`; recommendation first, "Read the full memo" for the rest; Copy and Export | `root = Memo("memo_1a2b3c4d")` |
| RiskFlagList | `RiskFlagList(resultId, minSeverity?)` | research report (ARCHITECTURE 6.3) or a live `research_job` (polls every 2.5 s: progress, entity choice via `POST /api/research/:jobId`, failure) | `root = RiskFlagList("research_1a2b3c4d")` |
| SourceList | `SourceList(resultId, title?)` | report `sources[]` plus every flag's sources (deduped); also `{ sources[] }` | `sources = SourceList("research_1a2b3c4d")` |
| Guidance | `Guidance(resultId, title?)` | what_matters `{ part, profile_label, dimensions[] {field, label, description, weight}, filters[], why }`; Apply raises `set_hard_requirements` (merged per field) | `root = Guidance("what_1a2b3c4d")` |
| Table | `Table(resultId, title?, maxRows?)` | run_sql `{ columns[], rows[][] }` (rows as arrays or objects); otherwise the first list of records in the result; sortable; 6 columns and 8 rows visible, the rest behind toggles | `root = Table("sql_1a2b3c4d", "Suppliers per risk level")` |

Design rules: the buyer reads a block in two seconds and asks the next question. One idea per block; one title line
in the base size; no subtitles, badges, footnotes or helper lines (provenance, method and caveats go into the quiet
corner dot's tooltip); nothing below `text-sm`; numbers right aligned in Geist Mono; risk levels as a colour dot plus
the word; tables without zebra stripes or vertical rules, hover only; at most two quiet actions, per-row actions on hover.

Missing fields degrade quietly (a dash, a hidden row, an empty state). Loading shows a skeleton; an unknown
or expired handle shows a small "This result has expired" state.

## Files

- `specs.ts`: name, description and Zod props (`zod/v4`) of every block. React-free, so the chat route can
  build the prompt and parse programs. Key order = positional order.
- `<block>.tsx` (`"use client"`): `XView` (usable on any screen with `resultId` or `data`) and `XBlock` (the OpenUI renderer).
- `src/lib/openui/library.tsx`: joins specs and renderers with `@openuidev/lang-core`. It is safe to import in route handlers
  (react-lang crashes there on `createContext`); renderers are client references on the server.
  Exports `library`, `openUiPromptSection(options?)`, `normalizeResponse`, `COMPONENT_PARAMS`, `OPENUI_EXAMPLES`, `OPENUI_RULES`.
- `fields.ts`: labels, direction, families (as in `get_metadata`), level bands, formatting.
- `primitives.tsx`: `BlockFrame` (one title line, quiet `InfoDot` note in the corner, at most two actions), `WithResult` (fetch + skeleton + error),
  `LevelDot` (alias `LevelChip`), `Dot`, `RiskBar`, `MoreButton`, `PinButton` (`reveal` for per-row hover actions;
  pins via `pinToShortlist` on the case store), all on the design system; risk colors only via `--risk-*`.
- `block-context.tsx`: `BlockEnvProvider { caseId, who, dispatch(UiAction), ask(text) }`; ChatPanel provides it.
- `fixtures.ts` + `dev-gallery.tsx`: `/dev/blocks`, the review page: every block in three states (many rows, one row,
  empty) cut from the data mocks (`STATE_FIXTURES`, `REVIEW`), plus research job states; light/dark switch or `?theme=dark`.
- `src/lib/hooks/use-result.ts`: `useResult(id, { data?, pollMs?, pollWhile? })`, module cache, request dedupe,
  `primeResult(s)`, `invalidateResult`, `prefetchResult`.

## Adding a block

1. Add its spec to `specs.ts` (`resultId` first).
2. Write `<block>.tsx` with `XView` + `XBlock`, export both from `index.ts`.
3. Register it in `library.tsx` (component + Stack union), then run `pnpm gen:openui`.
4. Add its states to `STATE_FIXTURES` and a `REVIEW` entry in `fixtures.ts`.
