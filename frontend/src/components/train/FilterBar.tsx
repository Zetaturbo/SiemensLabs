"use client";
import { useMemo } from "react";
import { X } from "lucide-react";
import { Button, Select, type SelectOption } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { PROFILE_LABEL } from "./config";
import { isFiltered, ME, RISK_LEVELS, STAGE_LABEL, STAGES, type Filters } from "./encoding";
import { usePartViews, useTrainUi } from "./store";

function FilterSelect<K extends keyof Filters>({ label, name, options }: { label: string; name: K; options: SelectOption<Filters[K] & string>[] }) {
  const value = useTrainUi((s) => s.filters[name]) as Filters[K] & string;
  const setFilter = useTrainUi((s) => s.setFilter);
  return (
    <div className="flex items-center gap-2">
      <span className="text-2xs font-medium tracking-[0.06em] text-tertiary uppercase">{label}</span>
      <Select<Filters[K] & string>
        size="sm"
        align="start"
        aria-label={label}
        options={options}
        value={value}
        onValueChange={(v) => setFilter(name, v)}
        className={value !== "all" ? "border-strong bg-selected" : undefined}
      />
    </div>
  );
}

export function FilterBar() {
  const cases = useCases((s) => s.cases);
  const filters = useTrainUi((s) => s.filters);
  const clear = useTrainUi((s) => s.clearFilters);
  const views = usePartViews();
  const departments = useMemo(() => {
    const set = new Set<string>([ME.department]);
    for (const c of Object.values(cases)) if (c.owner) set.add(c.owner.department);
    return [...set].sort();
  }, [cases]);
  const profiles = useMemo(() => [...new Set(views.map((v) => v.profileId))].sort(), [views]);
  const matching = views.filter((v) => v.matches).length;

  return (
    <div className="relative z-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-surface px-4 py-2">
      <FilterSelect
        label="Owner"
        name="owner"
        options={[
          { value: "all", label: "Everyone" },
          { value: "mine", label: "Mine" },
          { value: "unassigned", label: "Unassigned" },
          ...departments.map((d) => ({ value: `dept:${d}`, label: d })),
        ]}
      />
      <FilterSelect label="Stage" name="stage" options={[{ value: "all", label: "All stages" }, ...STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))]} />
      <FilterSelect
        label="Risk"
        name="risk"
        options={[{ value: "all", label: "Any risk" }, ...RISK_LEVELS.map((r) => ({ value: r, label: r })), { value: "unrated", label: "Not assessed" }]}
      />
      <FilterSelect
        label="Profile"
        name="profile"
        options={[{ value: "all", label: "All profiles" }, ...profiles.map((p) => ({ value: p, label: PROFILE_LABEL[p] ?? p }))]}
      />
      <div className="ml-auto flex items-center gap-2 text-sm text-subtext">
        <span>
          <span className="tabular font-mono text-ink">{matching}</span> of <span className="tabular font-mono">{views.length}</span> parts
        </span>
        {isFiltered(filters) && (
          <Button size="sm" variant="ghost" leading={<X />} onClick={clear}>
            Clear
          </Button>
        )}
      </div>
    </div>
  );
}
