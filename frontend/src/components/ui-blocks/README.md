# UI blocks (OpenUI components)

Trusted blocks the model composes: SupplierCard, CompareGrid, RadarProfile, ContributionWaterfall,
RankedList, Distribution, Verdict, Memo, RiskFlagList, SourceList, Table, Chart.
Each takes a `resultId` and fetches `/api/results/:id`. Register in `src/lib/openui/library.tsx`.
