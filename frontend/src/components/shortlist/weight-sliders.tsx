"use client";
import { RotateCcw, X } from "lucide-react";
import { Button, IconButton, Slider } from "@/design-system/react";
import { fieldLabel, type Metadata } from "@/components/case/domain";

export const SLIDER_MAX = 40;

/**
 * Relative weights in points (0-40). The board normalizes them to shares that sum to 1 before
 * calling rank_with_profile with custom_weights.
 */
export function WeightSliders({
  meta,
  weights,
  onChange,
  onRemove,
  onReset,
  addable,
  onAdd,
  dirty,
}: {
  meta: Metadata;
  weights: Record<string, number>;
  onChange: (field: string, points: number) => void;
  onRemove: (field: string) => void;
  onReset: () => void;
  addable: string[];
  onAdd: (field: string) => void;
  dirty: boolean;
}) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0) || 1;
  // stable order (profile order, then added fields) so sliders do not jump while dragging
  const entries = Object.entries(weights);
  return (
    <div className="space-y-2.5">
      {entries.map(([f, w]) => (
        <div key={f}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-ink">{fieldLabel(meta, f)}</span>
            <span className="flex items-center gap-1">
              <span className="w-10 text-right font-mono text-xs tabular-nums text-subtext">{Math.round((w / total) * 100)}%</span>
              <IconButton aria-label={`Remove ${fieldLabel(meta, f)}`} size="sm" className="size-5" onClick={() => onRemove(f)}>
                <X className="size-3" />
              </IconButton>
            </span>
          </div>
          <Slider aria-label={`Weight ${fieldLabel(meta, f)}`} min={0} max={SLIDER_MAX} step={1} value={w} onValueChange={(v) => onChange(f, v)} className="mt-1" />
        </div>
      ))}
      <div className="flex items-center gap-1.5 pt-1">
        <select
          aria-label="Add dimension"
          className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-subtext outline-none hover:border-strong focus:border-brand"
          value=""
          onChange={(e) => e.target.value && onAdd(e.target.value)}
        >
          <option value="">Add dimension</option>
          {addable.map((f) => (
            <option key={f} value={f}>
              {fieldLabel(meta, f)}
            </option>
          ))}
        </select>
        <Button size="sm" variant="ghost" leading={<RotateCcw />} disabled={!dirty} onClick={onReset}>
          Profile weights
        </Button>
      </div>
    </div>
  );
}
