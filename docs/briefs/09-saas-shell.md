# Brief 09: SaaS app shell

Branch: `feat/saas-shell` from `integration`. Edit only `frontend/src/components/shell/**`, `frontend/src/app/layout.tsx`,
`frontend/src/app/globals.css` (layout rules only), new routes `frontend/src/app/settings/**`, `frontend/src/app/cases/page.tsx`
(the cases list), `frontend/src/app/suppliers/**`, `frontend/src/app/research/**`, `frontend/src/app/reports/**`,
`frontend/src/app/team/**`, and `frontend/src/lib/session/**` (new, the signed-in user). Do not touch
`frontend/src/components/train/**`, `frontend/src/components/case/**`, `frontend/src/components/chat/**`,
`frontend/src/lib/cases/**`, skills or the data layer. If a screen needs a layout change to fit the frame, report the
exact change instead of making it.

## Direction (decided by the product owner)
What exists must feel like software as a service: a left sidebar with the product's sections, the signed-in user
bottom-left with an account menu, settings, notifications, search, help, a workspace name. The surfaces do not have to
work beyond navigation and static content, but they must exist and look like the real thing: quiet, consistent, on the
design system (white/graphite, Inter, Geist Mono for numbers, no raw hex, no other UI libraries, icons from
lucide-react). Minimal: nothing decorative, no marketing copy, short labels.

## Build
1. Frame. A root layout with a left sidebar (240 px, collapsible to 56 px icons, state in localStorage, keyboard `[`)
   and a content area that fills the rest of the viewport; the content area is the only scroll container, and the
   train map and the case screen keep their full-height behaviour inside it (they size to their container, not to the
   viewport; verify both at 1280 and 1440). Top of the sidebar: workspace switcher ("Siemens Mobility · Procurement",
   a menu with one other workspace, static). Middle: navigation with active state: Train map (`/train`), Cases
   (`/cases`), Suppliers (`/suppliers`), Research (`/research`), Reports (`/reports`), Team (`/team`), and a small
   section "Recent" with the three most recently updated cases from the case store. Bottom-left: the signed-in user
   (avatar initials, name, role) opening an account menu: Profile, Account settings, Notifications, Keyboard shortcuts,
   Theme (light, dark, system), Sign out (static). The signed-in user comes from `src/lib/session` (a static
   `currentUser`: Marcel-Felix Krause, Lead buyer, Rail procurement), in one place so a login provider can replace it.
2. Top bar inside the content area, 48 px: breadcrumb (section, then case name when in a case), a search field
   "Search cases, suppliers, parts" with ⌘K / Ctrl+K opening a command palette (static list: the cases, the sections,
   "Open train map"; Enter navigates), a notifications bell with two seeded items and a dot, help (opens a short
   shortcuts dialog), theme toggle. The existing top bar's contents fold into this one; keep the theme toggle
   component.
3. Pages, static but real looking, each a title, one line of context, and content on the design system:
   - `/cases`: a list of the 13 cases with part, stage dot and word, owner avatar, updated time, pinned/finalists
     counts, sorted by updated; click opens the case. Filter chips by stage.
   - `/suppliers`: a search input and a short explanation "Ask in a case to query suppliers", three quiet stat tiles
     (suppliers, countries, profiles) from `get_dataset_stats` through `/api/data`, and a link to the brake case.
   - `/research`: a list of research jobs (the Knorr-Bremse replay job as one row with status and date) and a "New
     research" button that opens a dialog with company name, country, website (static submit).
   - `/reports`: the routing and answer eval summaries if their result files exist (read the JSON at build time or
     via a tiny route), else an empty state; a "Decision memos" list from awarded cases.
   - `/team`: the people from the case owners (and the team roster when `src/lib/cases/team.ts` exists), with
     role, department, cases owned, an "Invite" button (static dialog).
   - `/settings`: tabs Profile, Workspace, Team, Integrations, Billing, Notifications. Integrations shows the real
     configuration read-only: model name, data source order, research mode (replay or live), with status dots.
     Billing shows a plan card ("Enterprise · annual") and a static invoices table. Everything else static forms with
     design system inputs; Save shows a toast.
4. Polish. Page transitions none; focus rings on; a 404 page in the frame; favicon and page titles per section;
   reduced motion respected; light and dark both tuned.

## Verify
Headless screenshots at 1440x900 and 1280x800, light and dark: train map in the frame, brake case in the frame,
`/cases`, `/settings` Integrations, the account menu open, the command palette open. No overlap, no double scroll
bars, no layout shift on sidebar collapse. The four checks pass. Report under 300 words, including any change a screen
needs to sit in the frame that you could not make.
