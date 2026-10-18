# Cases

`store.ts` (zustand) holds the 13 sourcing cases plus team presence; `actions.ts` writes them with a log entry; `team.ts` is the roster; `selectors.ts` has people in a case, people online and recent activity.

`seed.ts` seeds one case per train part (3 awarded, 3 finalists, 4 shortlist, 2 long list, 1 not started) from the dataset. Ids come from `pnpm tsx scripts/pick-seed.ts`; `pnpm check:seed` enforces the rules (filters = profile knock-outs, pins pass them, finalists = top 3 of the shortlist, awarded ranks first, log ascending, every author and person in the roster).

## Re-seeding

The store persists cases to localStorage (`srm.cases.v1`) as `{ seedVersion, cases }`. On load, saved state from another `SEED_VERSION` is dropped entirely and the new seed is written back; presence is never persisted.

Whenever you change `seed.ts` (ids, stages, log, decisions, presence), bump `SEED_VERSION` in `seed.ts`, run `pnpm check:seed`, and commit both. Without the bump, browsers that opened the app before keep the old cases.
