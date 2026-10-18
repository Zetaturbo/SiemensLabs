# Skills

One file per skill, registered in `registry.ts`. A skill is a procurement question pattern:
the model picks it (tool use), `run` computes against the data API (never the LLM),
`summarize` is the only text the model reads, `view` is the deterministic OpenUI default.

Rules
- Name skills after the data tool where one exists so the data owner's eval set maps 1:1.
- Descriptions are routing rules: what it computes, use when, do not use when, what it renders.
- Numbers never pass through the model: store full results with `ctx.putResult`, reference the handle in the view.
- Keep the core seven disjoint; `run_sql` is the catch-all.
