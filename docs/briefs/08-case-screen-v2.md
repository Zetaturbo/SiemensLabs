# Brief 08: case screen v2 (progress bar, 3D part, team presence, next-step nudge)

Branch: `feat/case-screen-v2` from `integration` after briefs 06 (case states and team) and the train map's
`PartThumbnail` component are merged. Edit only `frontend/src/app/cases/**`, `frontend/src/components/case/**`,
`frontend/src/components/chat/**`, `frontend/src/lib/prompt/system-prompt.ts`
and `frontend/src/lib/llm/**` where the nudge needs it. Do not touch skills, blocks, the data layer, `src/lib/cases`
or the train components (import `PartThumbnail` from `@/components/train`).

## Direction (decided by the product owner)
Inside the case the stage must be visible as a progress bar across the top, above the chat, not a small list in the
rail; the rail's flat silhouette is replaced by the small 3D part; other buyers are visibly working on the platform;
and the next step is always obvious: one highlighted action in the UI and a nudge from the model at the end of every
answer. Still minimal: nothing is added that the buyer does not need right now.

## Build
1. Progress bar. Full width above the chat, below the top bar: the four stages as segments (long list, shortlist,
   finalists, awarded), filled up to the current one in the stage colour, the current stage labelled, the three
   counts (matching, pinned, finalists) as small numbers under their segment, and the "Next: ..." line at the right
   end as the single primary action (a button that sends the next question to the chat). Clicking a past stage shows
   what happened there as a quiet popover from the case log (who, when, which ids). The rail loses the stage list and
   the counts.
2. Rail. From top: the `PartThumbnail` (interactive, 240x160, click opens the train map on that part), part name and
   group, owner with avatar initials, "In this case now" with the avatars of the people present (from the store's
   presence), a "Recent" list of the last five log entries across all cases with names and relative times ("Tom R.
   pinned 3 in Passenger doors · 4 min"), and the "Open train map" link. Collapsible as today.
3. Top bar: owned by the SaaS shell (brief 09), which shows the online people's avatars; do not touch
   `src/components/shell/**`.
4. Next-step nudge. In the system prompt: every answer ends with one short line proposing the single most useful next
   question for the case's stage and what is on screen ("Next: compare the top 3?"), phrased as a question the buyer
   can send as is; never more than one; the chat renders that line as the primary chip under the answer (parse the
   trailing "Next:" line out of the prose, do not show it twice). The opening message uses the same primary chip. The
   other chips stay secondary and at most two.
5. Chat context. Brief 06 found that `WorkflowContext` carries the shortlist but not the finalists or the awarded
   supplier, so "Why this supplier?" picked the wrong one. Add `finalists`, `awarded_supplier` and the `decision`
   rationale (text only) to the context the panel sends and to the prompt's workflow section (`src/lib/prompt`
   and `src/skills/types.ts` may be edited for this), and let the chips stop naming ids.
6. Keep brief 01's behaviour (view awareness, filter chips, collapsed rail memory) and the minimal pass; keep the
   four checks green.

## Verify
On `/cases/case_brake_system`: the bar shows shortlist current with the counts; the primary action sends its question;
the rail shows the rotating brake part, the owner, two people present, recent activity from other cases; the top bar
shows stacked avatars; after a real model turn the answer ends with one "Next:" line rendered as the primary chip (one
turn, the free tier rate-limits). Light and dark, 1280 and 1440 widths, no overlap. Screenshots under
`frontend/.screenshots/` (not committed). Report under 300 words.
