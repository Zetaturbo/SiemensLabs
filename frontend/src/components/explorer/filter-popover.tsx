"use client";
import { useEffect, useRef, useState } from "react";
import { Plus, SlidersHorizontal } from "lucide-react";
import { Button, Select } from "@/design-system/react";
import type { FilterCondition, FilterOp } from "@/lib/data-api/types";
import { cn } from "@/lib/utils";
import { fieldLabel, scoreFields, type Metadata } from "@/components/case/domain";
import { fromConditions, toConditions, type MaxLevel } from "./requirements";

/** The knock-out style rules the popover edits directly; everything else stays a chip (and is kept as is). */
const LEVEL_RULES = ["quality_risk", "safety_incident", "financial_health"] as const;

const LEVEL_OPTIONS: Array<{ value: "any" | MaxLevel; label: string }> = [
  { value: "any", label: "Any level" },
  { value: "High", label: "Not Critical" },
  { value: "Medium", label: "Medium or better" },
  { value: "Low", label: "Low only" },
];

const OPS: Array<{ value: FilterOp; label: string }> = [
  { value: "gte", label: "≥" },
  { value: "lte", label: "≤" },
  { value: "eq", label: "=" },
  { value: "ne", label: "≠" },
];

const OTHER_FIELDS = ["delivery_rating", "order_confirmation_rate", "order_change_rate", "po_volume_eur", "sourcing_risk_level", "supply_chain_complexity"];

const fieldClass = "h-8 w-full rounded-lg border border-line bg-surface px-2.5 font-mono text-sm tabular-nums text-ink outline-none placeholder:font-sans placeholder:text-placeholder hover:border-strong focus:border-brand focus:ring-2 focus:ring-[var(--lw-focus-ring)]";

/** Numeric input that commits on blur or Enter, so typing does not fire a query per keystroke. */
function NumberField({ value, placeholder, onCommit, label }: { value: number | undefined; placeholder: string; onCommit: (v: number | undefined) => void; label: string }) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? (value === undefined ? "" : String(value));
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim().replace(/[ ,%]/g, "");
    const n = t === "" ? undefined : Number(t);
    setDraft(null);
    if (n === undefined || Number.isFinite(n)) onCommit(n);
  };
  return (
    <input
      aria-label={label}
      inputMode="decimal"
      className={cn(fieldClass, "w-28", value !== undefined && "border-strong")}
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-sm text-ink">{label}</span>
      {children}
    </div>
  );
}

/**
 * "Edit filters": the case's hard requirements as four knock-out style rules (three risk ceilings and a delivery
 * floor) plus one free field / operator / value row. It edits the same condition list as the chips and the chat
 * (requirements.ts keeps rules it cannot show), and writes through `onChange` on every commit.
 */
export function FilterPopover({
  meta,
  conditions,
  onChange,
  onProfileKnockouts,
}: {
  meta: Metadata;
  conditions: FilterCondition[];
  onChange: (next: FilterCondition[]) => void;
  onProfileKnockouts: () => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const state = fromConditions(conditions);
  const [free, setFree] = useState<{ field: string; op: FilterOp; value: string }>({ field: "credit_rating", op: "lte", value: "" });

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null;
      // Select menus render in a portal; a pick there is still inside the popover.
      if (root.current?.contains(t) || t?.closest?.('[role="menu"]')) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const setLevel = (field: string, v: "any" | MaxLevel) => {
    const maxLevel = { ...state.maxLevel };
    if (v === "any") delete maxLevel[field];
    else maxLevel[field] = v;
    onChange(toConditions({ ...state, maxLevel }));
  };
  const delivery = state.ranges.delivery_rating ?? {};
  const setDeliveryMin = (min: number | undefined) => {
    const ranges = { ...state.ranges };
    const r = { ...delivery, min };
    if (r.min === undefined) delete r.min;
    if (r.min === undefined && r.max === undefined) delete ranges.delivery_rating;
    else ranges.delivery_rating = r;
    onChange(toConditions({ ...state, ranges }));
  };

  const freeFields = [...scoreFields(meta).map((f) => f.field), ...OTHER_FIELDS].map((f) => ({ value: f, label: fieldLabel(meta, f) }));
  const categorical = free.field.endsWith("_level") || free.field === "supply_chain_complexity";
  const addFree = () => {
    const raw = free.value.trim();
    if (!raw) return;
    const n = Number(raw.replace(/[ ,%]/g, ""));
    const value = !categorical && Number.isFinite(n) ? n : raw;
    onChange([...conditions, { field: free.field, op: free.op, value }]);
    setFree((f) => ({ ...f, value: "" }));
  };

  return (
    <div ref={root} className="relative shrink-0">
      <Button size="sm" variant="secondary" pill leading={<SlidersHorizontal />} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((o) => !o)}>
        Edit filters
      </Button>
      {open && (
        <div role="dialog" aria-label="Edit filters" className="absolute left-0 top-full z-30 mt-2 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-4 rounded-xl border border-subtle bg-surface p-4 shadow-lg">
          <div className="flex flex-col gap-2.5">
            {LEVEL_RULES.map((f) => (
              <Row key={f} label={fieldLabel(meta, f)}>
                <Select
                  size="sm"
                  aria-label={`${fieldLabel(meta, f)}: worst level allowed`}
                  options={LEVEL_OPTIONS}
                  value={state.maxLevel[f] ?? "any"}
                  onValueChange={(v) => setLevel(f, v)}
                  className={cn("w-40 shrink-0 font-normal", !state.maxLevel[f] && "text-subtext")}
                />
              </Row>
            ))}
            <Row label="Delivery rating at least">
              <NumberField label="Delivery rating minimum, percent" value={delivery.min} placeholder="e.g. 95 %" onCommit={setDeliveryMin} />
            </Row>
          </div>

          <div className="flex flex-col gap-2 border-t border-subtle pt-4">
            <span className="text-sm text-subtext">Any other rule</span>
            <div className="flex items-center gap-1.5">
              <Select size="sm" align="start" aria-label="Field" options={freeFields} value={free.field} onValueChange={(field) => setFree((f) => ({ ...f, field }))} className="min-w-0 flex-1 font-normal" />
              <Select size="sm" aria-label="Operator" options={OPS} value={free.op} onValueChange={(op) => setFree((f) => ({ ...f, op }))} className="w-14 shrink-0 font-mono" />
              <input
                aria-label="Value"
                className={cn(fieldClass, "w-20 shrink-0")}
                placeholder="value"
                value={free.value}
                onChange={(e) => setFree((f) => ({ ...f, value: e.target.value }))}
                onKeyDown={(e) => e.key === "Enter" && addFree()}
              />
            </div>
            <Button size="sm" variant="secondary" leading={<Plus />} onClick={addFree} disabled={!free.value.trim()} className="self-start">
              Add rule
            </Button>
          </div>

          <div className="flex items-center justify-between border-t border-subtle pt-3">
            <Button size="sm" variant="ghost" onClick={onProfileKnockouts}>
              Profile knock-outs
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onChange([])} disabled={conditions.length === 0}>
              Clear all
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
