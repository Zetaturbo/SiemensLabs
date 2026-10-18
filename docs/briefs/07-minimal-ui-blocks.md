# Brief 07: minimal UI blocks

Branch: `feat/minimal-blocks` from `feat/chat-first-case` (after brief 01's last commit), merged into `integration`
with it. Edit only `frontend/src/components/ui-blocks/**`, `frontend/src/lib/openui/library.tsx`,
`frontend/src/app/dev/blocks/**` and the generated snapshot via `pnpm gen:openui`. Do not touch the chat panel, the
case screen, skills, the data layer or the train map. Positional OpenUI arguments and the block names stay as they
are, so nothing the model has learned changes.

## Direction (decided by the product owner)
The blocks the chat renders must be minimalistic and not overloaded: no small text elements, no captions under
captions, no badges and helper lines, one idea per block, numbers readable at a glance. The buyer reads a block in
two seconds and asks the next question. Design system only (white/graphite, Inter, Geist Mono for numbers, risk
colors via `--risk-*`, no raw hex, no other libraries).

## Build
1. Double-check every block (the 12 existing ones plus `Guidance`) against its result shape with the fixtures in
   `fixtures.ts`: it renders for the real payload, for an empty result, for one row, for many rows, in light and dark.
   Fix what breaks. Record the check as a small test or a `/dev/blocks` section that shows the three states.
2. Reduce each block to its essentials, and rebuild the ones that need it:
   - One title line at most, in the type scale's base size; no subtitle, no "source" or "mock" badge inside the block
     (that information moves to a single quiet dot with a tooltip in the block's corner, or is dropped), no footnotes.
   - Tables: at most 6 columns, the rest behind a "more" toggle; at most 8 rows visible with "show all"; numbers right
     aligned in Geist Mono; risk levels as a colour dot plus word, not a coloured pill with text in it; no zebra
     stripes, no vertical borders; row hover only.
   - Comparisons: one column per supplier, dimensions as rows, best value per row marked with one dot, no deltas in
     tiny text; a "largest differences" line at most.
   - Rankings: rank, name, score bar, one reason; nothing else.
   - Charts: one series, no legend when a title suffices, axis labels only where values are not obvious, no grid
     clutter; the Kraljic matrix with four quiet quadrant labels and dots with names on hover only.
   - Verdicts and memos: short paragraphs with real sentences, no bullet soup, headings only if there are two sections.
   - Guidance: ranked dimensions with weight bars, suggested filters as chips, one Apply button.
   - Actions (pin, compare, open) are at most two quiet buttons per block, never one per row unless the row is the
     unit of action, and then as an icon button that appears on hover.
   - Spacing from the design system scale; minimum text size is the design system's small size, nothing below it.
3. Keep the specs in `specs.ts` and the library in sync; rerun `pnpm gen:openui` and commit the snapshot. If a block's
   argument list changes, do not: add a new block instead and keep the old name working.
4. Update `/dev/blocks` to show every block with the three states and both themes, as the review page.

## Verify
Headless screenshots of `/dev/blocks` in light and dark at 1280 px width, saved under `frontend/.screenshots/` (not
committed, list the paths). The four checks pass. Report under 300 words: which blocks you rebuilt, which you only
trimmed, what you removed, and anything in a result payload that forced a compromise.
