"use client";
import { useState } from "react";
import type { FilterCondition } from "@/lib/data-api/types";
import { describeCondition, familiesOf, familyLabel, fieldLabel, scoreFields, type Metadata, type StatsResult } from "@/components/case/domain";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { Spinner, cx, ui } from "@/components/case/primitives";
import { RANGE_FIELDS, SET_FIELDS, fromConditions, toConditions, type MaxLevel, type RangeField, type RequirementState, type SetField } from "./requirements";

const LEVEL_OPTIONS: Array<{ value: "" | MaxLevel; label: string }> = [
  { value: "", label: "Any" },
  { value: "High", label: "No Critical" },
  { value: "Medium", label: "Medium or better" },
  { value: "Low", label: "Low only" },
];

const RANGE_UNIT: Record<RangeField, string> = { delivery_rating: "%", order_change_rate: "%", po_volume_eur: "EUR" };

function NumberField({ value, placeholder, onCommit, label }: { value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    const n = t === "" ? undefined : Number(t);
    setDraft(null);
    if (n === undefined || Number.isFinite(n)) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={cx(ui.input, "w-full tabular-nums")}
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
      <span className="truncate text-xs" title={meta.fields.find((f) => f.field === field)?.description}>
        {label}
      </span>
      <select
        className={cx(ui.input, "w-32 py-0.5", state.maxLevel[field] && "border-blue-500 dark:border-blue-500")}
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
    <aside className={cx("flex w-72 shrink-0 flex-col border-r", ui.border, "bg-white dark:bg-zinc-950")}>
      <div className={cx("border-b px-3 py-3", ui.border)}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Hard requirements</div>
        <div className="mt-1 flex items-baseline gap-2" aria-live="polite">
          <span className="text-2xl font-semibold tabular-nums">{total === null ? "–" : total.toLocaleString("en-US")}</span>
          <span className={cx("text-xs", ui.muted)}>suppliers meet your requirements</span>
          {loading && <Spinner />}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button type="button" className={ui.btn} onClick={onApplyProfile} title={`Replace the rules with the knock-outs of ${profileLabel}`}>
            Profile knock-outs
          </button>
          <button type="button" className={ui.btnGhost} onClick={() => onChange([])} disabled={conditions.length === 0}>
            Clear all
          </button>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-auto px-3 py-3">
        {state.other.length > 0 && (
          <section>
            <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Other rules</h4>
            <ul className="flex flex-wrap gap-1">
              {state.other.map((c, i) => (
                <li key={i} className="flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-800 dark:bg-blue-500/15 dark:text-blue-200">
                  {describeCondition(meta, c)}
                  <button type="button" aria-label="Remove rule" className="opacity-60 hover:opacity-100" onClick={() => set({ ...state, other: state.other.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Operations</h4>
          <div className="space-y-2">
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
                  <div className="flex items-baseline justify-between text-xs">
                    <span>{fieldLabel(meta, f)}</span>
                    <span className={cx("text-[10px]", ui.faint)}>{RANGE_UNIT[f]}</span>
                  </div>
                  <div className="mt-0.5 grid grid-cols-2 gap-1.5">
                    <NumberField label={`${f} minimum`} value={r.min} placeholder={st ? `min ${fmtBound(f, st.min)}` : "min"} onCommit={(v) => update("min", v)} />
                    <NumberField label={`${f} maximum`} value={r.max} placeholder={st ? `max ${fmtBound(f, st.max)}` : "max"} onCommit={(v) => update("max", v)} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">Sourcing</h4>
          <div className="space-y-2">
            {(Object.keys(SET_FIELDS) as SetField[]).map((f) => {
              const all = SET_FIELDS[f];
              const allowed = state.sets[f] ?? all;
              return (
                <fieldset key={f}>
                  <legend className="text-xs">{fieldLabel(meta, f)}</legend>
                  <div className="mt-0.5 flex gap-1">
                    {all.map((v) => {
                      const on = allowed.includes(v);
                      return (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={on}
                          className={cx(
                            "flex-1 rounded border px-1.5 py-0.5 text-[11px]",
                            on ? "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200" : cx(ui.border, ui.muted, "line-through"),
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
        </section>

        <section>
          <h4 className="mb-1.5 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            <span>Risk dimensions</span>
            {activeLevels > 0 && <span className="font-normal normal-case text-blue-700 dark:text-blue-300">{activeLevels} set</span>}
          </h4>
          {levelSelect("total_risk_index", fieldLabel(meta, "total_risk_index"))}
          {familiesOf(meta).map((fam) => {
            const fields = sf.filter((f) => f.family === fam);
            const setCount = fields.filter((f) => state.maxLevel[f.field]).length;
            const open = openFamilies[fam] ?? setCount > 0;
            return (
              <div key={fam} className={cx("mt-1 border-t pt-1", ui.border)}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between py-0.5 text-left text-xs font-medium"
                  aria-expanded={open}
                  onClick={() => setOpenFamilies((o) => ({ ...o, [fam]: !open }))}
                >
                  <span>
                    {open ? "▾" : "▸"} {familyLabel(fam, meta)}
                  </span>
                  {setCount > 0 && <span className="text-[10px] text-blue-700 dark:text-blue-300">{setCount}</span>}
                </button>
                {open && <div className="pl-3">{fields.map((f) => levelSelect(f.field, f.label))}</div>}
              </div>
            );
          })}
        </section>
      </div>
    </aside>
  );
}
