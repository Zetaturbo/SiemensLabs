# Shortlist (the board's shortlist pane)

Right pane of the board on the Suppliers page (`src/components/shell/pages/suppliers-board.tsx`, `/suppliers?case=<caseId>`):

- `shortlist-pane.tsx`: "Shortlist". The pinned suppliers as a comparison grid in the minimal CompareGrid style: dimensions
  as rows grouped risk (profile score, Total Risk Index, the profile's four heaviest scores), delivery and procurement;
  suppliers as columns in profile rank; a dot marks the best value per row (lower or higher is better per metric, none for
  PO volume). The weight-profile selector (the four profiles) sets the case's profile and re-ranks the columns. With three or
  more pinned each column can advance to the finalists; on the finalists stage each finalist has a Research action, which
  opens the case chat with the question (`/cases/<id>?ask=...`, the research flow there). Each column's filled pin unpins it.
- `compare-table.tsx`: the comparison grid the shortlist and the real brake manufacturers (`/suppliers`) share: a header row
  per supplier (name with a tooltip, id or country, the pin, one action), grouped dimension rows with the direction per
  metric, the best value per row marked by a dot in a fixed slot, sticky header and label column.
- `ranking.ts`: `useShortlistRanking(case)`, the pinned ids ranked with `rank_with_profile`. The columns, the board's
  Continue step and the progress bar's Next step read this one result.

Data access: `useDataTool(tool, input)` from `src/lib/hooks/use-data-tool.ts` (`POST /api/data/:tool`).

`shortlist-board.tsx`, `heatmap-grid.tsx`, `weight-sliders.tsx` and `drop-dialog.tsx` are the old shortlist board. No route
renders them any more; they are kept unreachable until someone removes them (as are the old case shell, stage rail, supplier
drawer, finalists view and memo view in `src/components/case/`).
