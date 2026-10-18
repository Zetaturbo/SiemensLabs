# Brief 06: coherent case states for all 13 parts

Branch: `feat/case-states` from `feat/chat-first-case` (after brief 01's last commit), merged into `integration` with
it. Edit only `frontend/src/lib/cases/**`, `frontend/src/components/case/case-guide.ts`, `frontend/scripts/**`
(TypeScript only) and `frontend/evals/**` if a check is added. Do not touch screens, train components, skills, the
data layer or `train-parts.json`.

## Direction (decided by the product owner)
Every part of the train is a sourcing case at some stage, and clicking any part must show work that makes sense:
a part already awarded still shows the shortlist it came from, the finalists that were compared, the research that
was run, the decision and why; a part at finalists shows who was pinned and why these three remained; a part at long
list shows filters and nothing pinned yet. All of it from the real portfolio dataset, deterministic, no invented
companies beyond the ids in the dataset, and nothing that contradicts the data (a pinned supplier passes the case's
filters; the awarded one is the best of the finalists under the case's profile).

## Build
1. Seed all 13 parts in `src/lib/cases/seed.ts`, hand-written but chosen with a script. Stage mix: 3 awarded,
   3 finalists, 4 shortlist (brakes among them, unchanged: shortlist, 6 pinned, profile safety_critical, owner as
   today), 2 long list, 1 not started. Owners: six buyers across the groups (running gear, structure, traction, body
   systems, control), each owning two or three parts; departments consistent per group.
2. Per case, consistent fields: `profileId` from the part's profile; `hardRequirements` preset from the profile's
   knock-out rules (same shape the update_workflow skill writes); `shortlist` of 4 to 7 ids that pass those filters
   under that profile; `finalists` as a subset of the shortlist (3 for finalists and awarded stages); `awardedSupplier`
   the finalist ranked first by `rank_with_profile` for the case's profile; `riskSummary` derived from the awarded or
   top-pinned supplier's levels; `linkedEntities` only where research exists (keep the Knorr-Bremse replay link on the
   brakes case; no other real companies); `log` as a dated trail over the last eight weeks relative to now, in order:
   case opened, filters set, candidates pinned (with the ids), top 3 compared, research started and finished (finalists
   and awarded), finalists chosen, awarded with a one-sentence reason. Add to `SourcingCase` an optional
   `decision: { supplier: string; rationale: string; at: string }` for awarded cases, two sentences grounded in the
   data (profile dimensions where it leads, a flag it beat), and an optional `notes: string[]` of one-line buyer
   notes for finalists cases ("research on SUPP_00018 found two open compliance flags").
3. A script `frontend/scripts/pick-seed.ts` (run with `pnpm tsx`) that, from the dataset CSV and the engine's profile
   logic, prints candidate ids per case that satisfy the rules above, so the choices are reproducible; and a check
   `pnpm check:seed` that fails when a seed breaks a rule: ids exist, finalists subset of shortlist, awarded in
   finalists, pinned pass the filters, awarded ranks first under the profile, log dates ascending, every part has a
   case.
4. Re-seeding: the store persists to localStorage, so bump a `seedVersion` in the persisted state and re-seed when it
   changes, keeping nothing from the old seed. Document the bump in `src/lib/cases/README.md` (create it, ten lines).
5. Stage-aware opening message and chips in `case-guide.ts`, one line plus at most three chips, from the seeded state:
   - not started: "Not started · next: set filters" with "What matters for X?", "Show matching suppliers", "Pin the top 5".
   - long list: "N matching · nothing pinned · next: pin candidates" with the same chips minus the first.
   - shortlist: as brief 01.
   - finalists: "3 finalists · research done for N · next: award" with "Compare the finalists", "Research <top finalist name>",
     "Award the best".
   - awarded: "Awarded to <name> · <date> · 3 finalists" with "Why this supplier?", "Show the decision memo", "Reopen the case".
   The existing skills answer these (compare_suppliers, explain_supplier, shortlist_memo, update_workflow); check that
   the memo skill reads `decision` and `notes` when present so the memo for an awarded case reflects the decision.
6. The train map panel and the rail read the same store, so stage, owner and counts stay consistent without changes
   there; verify that the rail's three numbers and the panel's counts agree for every part.

## Verify
`pnpm check:seed` passes; open each of the 13 cases on `/cases/<id>`: rail and opening message match the stage; on
an awarded case "Why this supplier?" and "Show the decision memo" give grounded answers; on a finalists case
"Compare the finalists" shows the three; on the train map every part's dot colour matches its stage and the panel's
activity shows the seeded log. The four checks pass. Report under 300 words: the stage mix with owners, how ids were
picked, and anything in the dataset that made a case hard to seed coherently.
