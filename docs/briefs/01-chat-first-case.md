# Brief 01: chat-first case screen

Branch: `feat/chat-first-case` from `integration`. Owner of this brief edits `frontend/src/app/cases/**`,
`frontend/src/components/case/**`, `frontend/src/components/chat/**`, `frontend/src/skills/**`,
`frontend/src/lib/openui/library.tsx`, `frontend/src/components/ui-blocks/**`, `frontend/src/app/page.tsx`.
Do not touch `frontend/src/components/train/**` or `frontend/src/app/train/**`.

## Direction (decided by the product owner)
The chat is the product. A buyer opens a sourcing case for one train part and does everything by talking; every
table, chart or comparison is a block inside the conversation. The current dashboard-style case screens (explorer
with filter sidebar, shortlist board, drawer, finalists, memo pages) are too complicated and are hidden for the demo.
Minimal, clean: short labels, no sub-sentences, no clutter.

## Build
1. New `/cases/[caseId]` (keep `export const instant = false`): two panes.
   - Left, about 300 px, the context rail: part name and group (from `src/config/train-parts.json` via the case's
     partId), a small inline SVG train silhouette with the part highlighted, the four stages (long list, shortlist,
     finalists, awarded) as a progress line with the current one marked, three numbers in a row (matching, pinned,
     finalists), the owner, one line "Next: ..." derived from the stage (shortlist with < 3 pinned: "pin candidates";
     >= 3: "compare the top 3"; finalists: "run research, then award"), and a quiet "Open train map" link. Nothing else.
   - Right, all remaining width, full height: the chat. Reuse `ChatPanel` from `src/components/chat` (it already
     consumes the chat route protocol, applies ui_actions to the case store, renders OpenUI blocks, has suggestion
     chips). Larger message area, composer at the bottom, chips above the composer.
   - Filter bar above the chat: one row of chips for the filters applied to this case, from the case's
     `hardRequirements` (set via chat through the update_workflow skill's ui_actions, preset from the profile's
     knock-out rules). Chips read "Quality: not Critical", "Delivery ≥ 90 %", "Volume > 1 M EUR", each with an x that
     updates the store. Empty state: "No filters yet. Ask what matters." Chips animate in when a turn adds them.
   - Opening message, built locally without an LLM call: "Brake system · shortlist · 6 pinned · next: compare the
     top 3", one or two lines, plus three stage-appropriate suggestion chips.
2. Guidance skill `what_matters` in `src/skills` (follow the existing skill pattern): input is a part id or free-text
   part name; map to a profile via `train-parts.json` (fallbacks by criticality: safety parts -> safety_critical,
   electronics/software -> strategic_system, consumables -> commodity, labor-heavy -> lksg_due_diligence); return,
   deterministically from `list_profiles` and `get_metadata`, the top weighted dimensions with descriptions, the
   recommended knock-out filters, and one sentence why. New OpenUI block `Guidance` (register in library.tsx,
   positional args, resultId first): ranked dimension list with weights and suggested filters as chips with an
   "Apply" button that sets the case's hard requirements. Re-run `pnpm gen:openui` and commit the snapshot. Register
   the skill, add two example questions, add them to `evals/routing/questions.json`.
3. Hide the old screens: remove them from navigation and the case layout; keep code but unreachable, or move routes
   under `/legacy/`. `/dev/blocks` may stay. Home page links only to the train map and the brake case. Top bar:
   product name, train map, theme toggle.

## Verify
Open `/cases/case_brake_system`: rail shows the brake system at its stage; the opening message appears; ask
"which filters matter when procuring brakes?" and confirm the Guidance block and Apply; ask "show me suppliers without
a critical quality score and delivery above 95" and confirm a ranked list and updated chips; pin two and confirm the
rail counts. Light and dark theme. Screenshots if possible.
