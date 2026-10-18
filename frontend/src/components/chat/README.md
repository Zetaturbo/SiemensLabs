# Chat panel

`<ChatPanel caseId context? onAction? suggestions? demo? variant? intro? placeholder? />` (mounted full-width in `src/components/case/case-screen.tsx`).

- `variant="page"`: the chat is the screen (no header, centred reading column, first three unasked `suggestions` above the composer);
  `intro` is the opening message the page builds locally. `"panel"` (default) is the old side-panel look.
- `view`: the page's part of `workflow.view` (screen, filter chip texts, unsaved inputs). The panel adds the blocks of the
  rendered answers (most recent first) with the supplier ids each block reported through `BlockEnv.report`, and offers
  "Compare the top 3 shown" / "Explain the top one shown" chips for the latest blocks (page variant).

- `useChat` from `@ai-sdk/react` (the React binding of `ai` v7; `ai` itself has no `useChat`) against `/api/chat`.
  Every turn sends `{ workflow }`: the `context` prop if given (the case screens build it), on top of a context
  derived from the case store (`workflow-context.ts`).
- Renders the route's protocol (`src/app/api/chat/route.ts`, `src/lib/llm/protocol.ts`):
  - tool parts as chips (`running filter_suppliers`, then the tool's `summary`);
  - text parts while streaming (prose + ```openui-lang fences or bare OpenUI Lang, `assistant-text.tsx`);
  - `data-answer { prose, openui, source, issues }` as the final view once it arrives (a note when `source` is `fallback`);
  - every OpenUI program goes through `normalizeResponse` and `<Renderer isStreaming>`.
- Suggestion chips: `suggestions` prop, else the first example of each core skill from `GET /api/chat`, else the demo prompts.

## ui_actions

Read from `data-ui-actions` parts, tool outputs (`output.ui_actions`), transient data parts and message metadata;
deduped by tool call, applied once each. Shapes: `UiAction` in `ui-actions.ts` (a lenient superset of `src/skills/types.ts`).

| Action | Applied by |
|---|---|
| `add_to_shortlist`, `remove_from_shortlist` | case store (`pinToShortlist` / `unpin`) |
| `set_profile` | case store (`setProfile`) |
| `set_case_stage` | case store (`setStage`, `case_id` or the current case) |
| `set_hard_requirements` | case store (`setHardRequirements`): the filter chips above the chat |
| `assign_part` | case store: reassigns the part's case owner, or creates the case |
| `open_supplier` | selects the supplier for the next turn (shown as a pill in the composer) |
| `start_research` | case screen: records the job (`setResearchJob`); the RiskFlagList block polls it in the chat |
| `open_compare` | no-op on the case screen (ask "compare my top 3" instead) |

All actions also reach `onAction`. Blocks raise the same actions through `BlockEnvProvider.dispatch`.

## Demo mode

The header switch (default from `NEXT_PUBLIC_CHAT_DEMO=1`) swaps in `createDemoTransport()`: no request to `/api/chat`.
It picks a canned scenario from the last message (filter, rank, compare, explain, similar, pin, SQL, research, memo,
out of scope), primes the fixture results into the `useResult` cache, and streams the same chunk types as the route
(tool parts, `data-ui_actions`, OpenUI Lang text). Use it as the video fallback or when the LLM is down.
When the route is missing or failing, the error box offers "Use demo mode".

Dev tip: Next 16 blocks dev assets for origins other than the dev host, so open the dev server on the host it was
started with (`next dev -H <tailscale ip>`) or the page will not hydrate.
