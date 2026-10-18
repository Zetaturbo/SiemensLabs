# Explorer (the board's candidates pane)

Left pane of the case board (`src/components/case/case-board.tsx`, `/cases/[caseId]?view=board`):

- `candidates-pane.tsx`: "Candidates". The case's filters as chips (`FilterChips`, same source as the chat's chip bar) with
  the "Edit filters" popover, a search by name or id (`useSupplierSearch` in `src/lib/hooks`), the matching suppliers from
  `filter_suppliers` (lowest Total Risk Index first: name, id, TRI with a level dot, the profile's two heaviest scores, a pin
  per row on hover), a live "N matching" count, "Show more" paging, and the portfolio view folded away under the table.
- `filter-popover.tsx`: three risk ceilings (quality, safety incidents, financial health), a delivery floor and one free
  field / operator / value row; profile knock-outs and clear all. Writes the case's hard requirements.
- `requirements.ts`: two-way mapping between those controls and `filter_suppliers` conditions; rules it cannot show are kept.
- `kraljic-matrix.tsx`: the portfolio view (PO volume against sourcing risk, quadrants from `kraljic_position`).

Filters and pins write through `src/lib/cases/actions.ts`, so the chat sees the same state.

`explorer-view.tsx`, `filter-sidebar.tsx` and `results-table.tsx` are the old long-list screen. No route renders them any
more; they are kept unreachable until someone removes them.
