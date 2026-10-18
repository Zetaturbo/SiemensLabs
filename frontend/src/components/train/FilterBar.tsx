"use client";
import { useMemo } from "react";
import { X } from "lucide-react";
import { IconButton, Select, Tooltip, type SelectOption } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { isFiltered, ME, RISK_LEVELS, STAGE_LABEL, STAGES, type Filters } from "./encoding";
import { useTrainUi } from "./store";

function FilterSelect<K extends keyof Filters>({ label, name, options }: { label: string; name: K; options: SelectOption<Filters[K] & string>[] }) {
  const value = useTrainUi((s) => s.filters[name]) as Filters[K] & string;
  const setFilter = useTrainUi((s) => s.setFilter);
  return (
    <Select<Filters[K] & string>
      size="sm"
      align="start"
      aria-label={label}
      options={options}
      value={value}
      onValueChange={(v) => setFilter(name, v)}
      className={value !== "all" ? "h-7 rounded-md border-transparent bg-selected px-2 text-xs text-ink" : "h-7 rounded-md border-transparent bg-transparent px-2 text-xs text-subtext hover:bg-hover"}
    />
  );
}

/** Three compact filters: owner, stage, risk. Options name themselves, so there are no field labels. */
export function FilterBar() {
  const cases = useCases((s) => s.cases);
  const filtered = useTrainUi((s) => isFiltered(s.filters));
  const clear = useTrainUi((s) => s.clearFilters);
  const departments = useMemo(() => {
    const set = new Set<string>([ME.department]);
    for (const c of Object.values(cases)) if (c.owner) set.add(c.owner.department);
    return [...set].sort();
  }, [cases]);

  return (
    <div
      role="toolbar"
      aria-label="Filter parts"
      className="flex h-8 items-center gap-0.5 rounded-lg border border-line bg-[var(--lw-glass-strong)] px-0.5 shadow-sm backdrop-blur-[var(--lw-glass-blur)]"
    >
      <FilterSelect
        label="Owner"
        name="owner"
        options={[
          { value: "all", label: "Any owner" },
          { value: "mine", label: "Mine" },
          { value: "unassigned", label: "Unassigned" },
          ...departments.map((d) => ({ value: `dept:${d}`, label: d })),
        ]}
      />
      <FilterSelect label="Stage" name="stage" options={[{ value: "all", label: "Any stage" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))]} />
      <FilterSelect
        label="Risk"
        name="risk"
        options={[{ value: "all", label: "Any risk" }, ...RISK_LEVELS.map((r) => ({ value: r, label: `${r} risk` })), { value: "unrated", label: "Not assessed" }]}
      />
      {filtered && (
        <Tooltip label="Clear filters" side="bottom">
          <IconButton aria-label="Clear filters" size="sm" className="size-7" onClick={clear}>
            <X />
          </IconButton>
        </Tooltip>
      )}
    </div>
  );
}
