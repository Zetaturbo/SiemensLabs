# Design system (vendored from LegalWork)

Vendored copy of `packages/ui/src` from https://github.com/eigenweltlabs/legalwork (MIT, Eigenwelt Labs; see LICENSE).
Identity: white, glass and graphite. Hierarchy from precise type, quiet surface contrast, hairline borders, purposeful motion.
Color is reserved for semantic status (success, warning, danger) and data.

- `styles/tokens.css`: runtime `--lw-*` tokens, light + dark (`[data-theme="dark"]`) + blackout.
- `styles/theme.css`: Tailwind v4 `@theme` mapping (bg-surface, text-ink, text-subtext, border-line, rounded-lg, text-sm ...).
- `react/index.ts`: components. Import from `@/design-system/react`.

Usage: `import { Button, Card, Badge, Tabs, Table, Slider, Skeleton, StatusDot } from "@/design-system/react"`.
Keep edits minimal so the folder can be refreshed from upstream.
