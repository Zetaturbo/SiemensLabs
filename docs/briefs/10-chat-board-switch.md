# Brief 10: Chat / Board switch in the case

Branch: `feat/chat-board-switch` from `integration` after brief 08 (case screen v2) is merged. Edit only
`frontend/src/components/case/**`, `frontend/src/components/explorer/**`, `frontend/src/components/shortlist/**`,
`frontend/src/app/cases/[caseId]/**` and `frontend/src/lib/hooks/**`. Do not touch the chat panel's internals
(`src/components/chat/**`), blocks, skills, the data layer, the shell or the train components.

## Direction (decided by the product owner)
The chat-only case is disruptive for buyers who want to click. The case gets a two-way switch, "Chat" and "Board",
on the same case store, so pins, filters, stage and counts carry across instantly in both directions. Chat stays the
default and the demo path. Board is a classic working view laid out like the teammate's static dashboard
(PR #9, `frontend/components/supplier-comparison.tsx` on `origin/feature/dashboard-research`, read it for the layout
and tone): candidate pool on the left, shortlist comparison on the right, one primary Continue action bottom right.
It is built from our own hidden explorer and shortlist screens, reduced to the minimal block style of brief 07: no
overloaded sidebars, no small text, one idea per panel.

## Build
1. Switch. A segmented control "Chat · Board" at the right end of brief 08's progress bar (the bar, the rail and
   the "Next:" primary action stay in both modes). The mode is per case, remembered in localStorage, and the URL
   carries `?view=board` so a link opens the board. Switching keeps the chat's messages mounted (hide, do not
   unmount) so nothing is lost.
2. Board layout, in the chat's area: left pane (about 40 %) "Candidates": the filter chips (same source as the
   chat's chip bar) with an "Edit filters" popover built from the explorer's filter controls reduced to the four
   knock-out style conditions plus one free field/op/value row; a search field (name or id); a table from
   `filter_suppliers` with name, id, Total Risk Index with a level dot, two profile-weighted columns, and a pin
   toggle per row on hover; a live "N matching" count; pagination by "show more". Right pane (60 %) "Shortlist":
   the pinned suppliers as a comparison grid (reuse the minimal CompareGrid's primitives: dimensions as rows,
   suppliers as columns, best value per row marked with a dot, metrics grouped as risk, delivery, procurement with
   lower/higher-is-better per metric), a weight-profile selector (the four profiles) that re-ranks the columns, an
   "Advance to finalists" action on each column once three or more are pinned, and a Research action per column on
   the finalists stage (existing research flow). Empty states in one sentence each. Everything reads from and writes
   to the case store through the existing actions, so the chat sees the same state.
3. Continue. Bottom right of the board, one primary button with the stage's next step (same text as the "Next:"
   action): on shortlist with fewer than three pinned it is disabled with "Pin 3 candidates"; with three or more it
   advances to finalists; on finalists it opens the award dialog (existing); on awarded it opens the memo in the chat
   (switches to Chat and sends "Show the decision memo").
4. Kraljic. The explorer's Kraljic matrix becomes a collapsible section under the candidates table ("Portfolio view"),
   closed by default, minimal.
5. Remove or leave unreachable whatever of the old explorer, shortlist board, drawer and memo pages is not used by the
   board; do not delete the finalists and memo flows the chat still uses.

## Verify
On `/cases/case_brake_system`: switch to Board, pin two from the candidates table, switch to Chat and confirm the rail
and chips show them; in Chat ask to pin one more (one real model turn, Nebius env), switch to Board and see three
columns; change the profile and see the columns re-rank; Continue advances to finalists and the progress bar follows;
`?view=board` opens the board directly. Light and dark, 1280 and 1440, no overlap, no page scroll. Four checks and
`check:seed` pass. Screenshots under `frontend/.screenshots/` (not committed). Report under 300 words.
