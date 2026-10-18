/**
 * UI blocks. Two ways to use them:
 * - In the chat: the model composes them in OpenUI Lang; definitions live in src/lib/openui/library.tsx.
 * - On screens: render the *View components directly with `resultId` or with `data` you already have.
 */
export { BlockEnvProvider, useBlockEnv, type BlockEnv } from "./block-context";
export { specs, STACK_DESCRIPTION, type BlockName, type BlockProps } from "./specs";
export * from "./fields";
export { LevelChip, LevelDot, Dot, RiskBar, PinButton, BlockFrame, InfoDot, WithResult, LEVEL_STYLE } from "./primitives";
export { Markdown } from "./markdown";

export { RankedListBlock, RankedListView, toRankedRows } from "./ranked-list";
export { CompareGridBlock, CompareGridView, parseCompare } from "./compare-grid";
export { VerdictBlock, VerdictView, deriveVerdict, type VerdictFamily } from "./verdict";
export { ContributionWaterfallBlock, ContributionWaterfallView, buildWaterfall } from "./contribution-waterfall";
export { RadarProfileBlock, RadarProfileView } from "./radar-profile";
export { SupplierCardBlock, SupplierCardView, pickSupplier } from "./supplier-card";
export { MemoBlock, MemoView, parseMemo, memoToMarkdown, type MemoDoc } from "./memo";
export { RiskFlagListBlock, RiskFlagListView, SeverityChip, parseReport, type Report, type Severity } from "./risk-flag-list";
export { SourceListBlock, SourceListView, collectSources } from "./source-list";
export { TableBlock, TableView, toTable } from "./table";
export { TextBlock, TextView } from "./text";
export { GuidanceBlock, GuidanceView, parseGuidance } from "./guidance";
export { OfferingTableBlock, OfferingTableView, parseOfferings } from "./offering-table";
export { RfqBoardBlock, RfqBoardView, parseRfq } from "./rfq-board";
export { conditionLabel, conditionKey, fieldShortLabel } from "./condition-label";
export { StackBlock } from "./stack";
