# Shortlist (the board's shortlist pane)

Right pane of the case board (`src/components/case/case-board.tsx`) on the Suppliers page (`/suppliers?case=<caseId>`):

- `shortlist-pane.tsx`: "Shortlist". The pinned suppliers as a comparison grid in the minimal CompareGrid style: dimensions
  as rows grouped risk (profile score, Total Risk Index, the profile's four heaviest scores), delivery and procurement;
  suppliers as columns in profile rank; a dot marks the best value per row (lower or higher is better per metric, none for
  PO volume). The weight-profile selector (the four profiles) sets the case's profile and re-ranks the columns. With three or
  more pinned each column can advance to the finalists; on the finalists stage each finalist has a Research action, which
  opens the case chat with the question (`/cases/<id>?ask=...`, the research flow there). Unpin on column hover.
- `ranking.ts`: `useShortlistRanking(case)`, the pinned ids ranked with `rank_with_profile`. The columns, the board's
  Continue step and the progress bar's Next step read this one result.

Data access: `useDataTool(tool, input)` from `src/lib/hooks/use-data-tool.ts` (`POST /api/data/:tool`).

`shortlist-board.tsx`, `heatmap-grid.tsx`, `weight-sliders.tsx` and `drop-dialog.tsx` are the old shortlist board. No route
renders them any more; they are kept unreachable until someone removes them (as are the old case shell, stage rail, supplier
drawer, finalists view and memo view in `src/components/case/`).
