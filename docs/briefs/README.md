# Builder briefs

Self-contained task briefs for Claude Code cloud sessions. Start a session on claude.ai/code against this repo,
base it on branch `integration`, paste one brief as the first message. Each brief names its branch; push it when done.
Environment variables for sessions that run the chat: `LLM_BASE_URL=https://integrate.api.nvidia.com/v1`,
`LLM_MODEL=nvidia/nemotron-3-ultra-550b-a55b`, `LLM_API_KEY=<key>`, `DATA_API_MOCK=1`.

Common rules for every brief: TypeScript only in `frontend/`; pnpm; run `pnpm install`, `pnpm exec next typegen`,
`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build` before pushing; Next.js 16 differs from training data, read
`frontend/node_modules/next/dist/docs/` before using an API from memory; design system is vendored at
`frontend/src/design-system` (white, graphite, Inter, Geist Mono; no raw hex, risk colors only via `--risk-*`);
commit as `git -c user.name="Marcel-Felix Krause" -c user.email="marcel@yavio.ai" commit ...` with
`Co-Authored-By: Claude <noreply@anthropic.com>`; end with a report under 300 words.
