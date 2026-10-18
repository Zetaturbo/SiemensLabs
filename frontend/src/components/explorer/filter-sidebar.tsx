"use client";
import { useState, type ReactNode } from "react";
import { ChevronRight, X } from "lucide-react";
import { Button } from "@/design-system/react";
import type { FilterCondition } from "@/lib/data-api/types";
import { cn } from "@/lib/utils";
import { describeCondition, familiesOf, familyLabel, fieldLabel, scoreFields, type Metadata, type StatsResult } from "@/components/case/domain";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { Spinner, ui } from "@/components/case/primitives";
import { RANGE_FIELDS, SET_FIELDS, fromConditions, toConditions, type MaxLevel, type RangeField, type RequirementState, type SetField } from "./requirements";

const LEVEL_OPTIONS: Array<{ value: "" | MaxLevel; label: string }> = [
  { value: "", label: "Any level" },
  { value: "High", label: "No Critical" },
  { value: "Medium", label: "Medium or better" },
  { value: "Low", label: "Low only" },
];

const RANGE_UNIT: Record<RangeField, string> = { delivery_rating: "%", order_change_rate: "%", po_volume_eur: "EUR" };

/** Numeric input that commits on blur or Enter, so typing does not fire a query per keystroke. */
function NumberField({ value, placeholder, onCommit, label }: { value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim().replace(/[ ,]/g, "");
    const n = t === "" ? undefined : Number(t);
    setDraft(null);
    if (n === undefined || Number.isFinite(n)) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={cn(ui.input, "w-full font-mono tabular-nums", value !== undefined && "border-strong")}
      placeholder={placeholder}
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}

function fmtBound(field: RangeField, v: number | undefined) {
  if (v === undefined) return "";
  return field === "po_volume_eur" ? Math.round(v).toLocaleString("en-US") : v.toFixed(1);
}

function Section({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className={ui.eyebrow}>{title}</h4>
        {right}
      </div>
      {children}
    </section>
  );
}

export function FilterSidebar({
  meta,
  conditions,
  onChange,
  total,
  loading,
  onApplyProfile,
  profileLabel,
}: {
  meta: Metadata;
  conditions: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  total: number | null;
  loading: boolean;
  onApplyProfile: () => void;
  profileLabel: string;
}) {
  const state = fromConditions(conditions);
  const set = (next: RequirementState) => onChange(toConditions(next));
  const stats = useDataTool<StatsResult>("get_dataset_stats", { fields: [...RANGE_FIELDS] });
  const statOf = (f: string) => stats.data?.stats?.find((s) => s.field === f);
  const [openFamilies, setOpenFamilies] = useState<Record<string, boolean>>({});
  const sf = scoreFields(meta);
  const activeLevels = Object.keys(state.maxLevel).length;

  const levelSelect = (field: string, label: string) => (
    <label key={field} className="flex items-center justify-between gap-2 py-0.5">
      <span className="truncate text-sm text-ink" title={meta.fields.find((f) => f.field === field)?.description}>
        {label}
      </span>
      <select
        className={cn(ui.input, "h-7 w-36 shrink-0 px-1.5 text-xs", state.maxLevel[field] ? "border-strong font-medium" : "text-subtext")}
        value={state.maxLevel[field] ?? ""}
        onChange={(e) => {
          const maxLevel = { ...state.maxLevel };
          if (e.target.value) maxLevel[field] = e.target.value as MaxLevel;
          else delete maxLevel[field];
          set({ ...state, maxLevel });
        }}
      >
        {LEVEL_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-subtle bg-surface">
      <div className="border-b border-subtle px-4 py-3">
        <div className={ui.eyebrow}>Hard requirements</div>
        <div className="mt-1 flex items-baseline gap-2" aria-live="polite">
          <span className="font-mono text-3xl font-semibold tabular-nums tracking-[-0.02em]">{total === null ? "–" : total.toLocaleString("en-US")}</span>
          {loading && <Spinner />}
        </div>
        <div className="text-sm text-subtext">suppliers meet your requirements</div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Button size="sm" onClick={onApplyProfile} title={`Replace the rules with the knock-outs of ${profileLabel}`}>
            Profile knock-outs
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={conditions.length === 0}>
            Clear all
          </Button>
        </div>
      </div>

      <div className="flex-1 space-y-5 overflow-auto px-4 py-4">
        {state.other.length > 0 && (
          <Section title="Other rules">
            <ul className="flex flex-wrap gap-1">
              {state.other.map((c, i) => (
                <li key={i} className="flex h-6 items-center gap-1 rounded-md bg-sunken pl-2 pr-1 text-xs text-ink">
                  {describeCondition(meta, c)}
                  <button type="button" aria-label="Remove rule" className="rounded p-0.5 text-tertiary hover:bg-hover hover:text-ink" onClick={() => set({ ...state, other: state.other.filter((_, j) => j !== i) })}>
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Operations">
          <div className="space-y-2.5">
            {RANGE_FIELDS.map((f) => {
              const r = state.ranges[f] ?? {};
              const st = statOf(f);
              const update = (k: "min" | "max", v: number | undefined) => {
                const nr = { ...r, [k]: v };
                if (nr.min === undefined) delete nr.min;
                if (nr.max === undefined) delete nr.max;
                const ranges = { ...state.ranges };
                if (nr.min === undefined && nr.max === undefined) delete ranges[f];
                else ranges[f] = nr;
                set({ ...state, ranges });
              };
              return (
                <div key={f}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span>{fieldLabel(meta, f)}</span>
                    <span className="text-2xs text-tertiary">{RANGE_UNIT[f]}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    <NumberField label={`${fieldLabel(meta, f)} minimum`} value={r.min} placeholder={st ? `min ${fmtBound(f, st.min)}` : "min"} onCommit={(v) => update("min", v)} />
                    <NumberField label={`${fieldLabel(meta, f)} maximum`} value={r.max} placeholder={st ? `max ${fmtBound(f, st.max)}` : "max"} onCommit={(v) => update("max", v)} />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Sourcing">
          <div className="space-y-2.5">
            {(Object.keys(SET_FIELDS) as SetField[]).map((f) => {
              const all = SET_FIELDS[f];
              const allowed = state.sets[f] ?? all;
              return (
                <fieldset key={f}>
                  <legend className="text-sm">{fieldLabel(meta, f)}</legend>
                  <div className="mt-1 flex gap-0.5 rounded-xl bg-sunken p-0.5" role="group">
                    {all.map((v) => {
                      const on = allowed.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={on}
                          className={cn(
                            "h-7 flex-1 rounded-[10px] text-sm font-medium transition-colors",
                            on ? "bg-surface text-ink shadow-xs" : "text-tertiary line-through hover:text-subtext",
                          )}
                          onClick={() => {
                            const next = on ? allowed.filter((x) => x !== v) : all.filter((x) => allowed.includes(x) || x === v);
                            const sets = { ...state.sets };
                            if (next.length === all.length) delete sets[f];
                            else sets[f] = next;
                            set({ ...state, sets });
                          }}
                        >
                          {v}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </Section>

        <Section title="Risk dimensions" right={activeLevels > 0 ? <span className="text-2xs font-medium text-ink">{activeLevels} set</span> : undefined}>
          {levelSelect("total_risk_index", fieldLabel(meta, "total_risk_index"))}
          {familiesOf(meta).map((fam) => {
            const fields = sf.filter((f) => f.family === fam);
            const setCount = fields.filter((f) => state.maxLevel[f.field]).length;
            const open = openFamilies[fam] ?? setCount > 0;
            return (
              <div key={fam} className="mt-1 border-t border-subtle pt-1">
                <button
                  type="button"
                  className="flex w-full items-center justify-between rounded-md py-1 text-left text-sm font-medium hover:bg-hover"
                  aria-expanded={open}
                  onClick={() => setOpenFamilies((o) => ({ ...o, [fam]: !open }))}
                >
                  <span className="flex items-center gap-1">
                    <ChevronRight className={cn("size-3.5 text-tertiary transition-transform", open && "rotate-90")} />
                    {familyLabel(fam, meta)}
                  </span>
                  {setCount > 0 && <span className="font-mono text-2xs text-ink">{setCount}</span>}
                </button>
                {open && <div className="pb-1 pl-4">{fields.map((f) => levelSelect(f.field, f.label))}</div>}
              </div>
            );
          })}
        </Section>
      </div>
    </aside>
  );
}
