"use client";
import { useCallback, useState } from "react";
import { X } from "lucide-react";
import { conditionKey, conditionLabel } from "@/components/ui-blocks/condition-label";
import { setHardRequirements } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";
import { CURRENT_USER } from "./ui-store";

/** Fades and lifts a chip in once, unless the user prefers reduced motion. */
function useEnter(animate: boolean) {
  return useCallback(
    (el: HTMLElement | null) => {
      if (!el || !animate || typeof el.animate !== "function") return;
      if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
      el.animate(
        [
          { opacity: 0, transform: "translateY(4px) scale(0.96)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 260, easing: "cubic-bezier(0.2, 0.8, 0.2, 1)" },
      );
    },
    [animate],
  );
}

function Chip({ condition, animate, onRemove }: { condition: FilterCondition; animate: boolean; onRemove: () => void }) {
  const ref = useEnter(animate);
  const label = conditionLabel(condition);
  return (
    <span ref={ref} data-filter-chip className="inline-flex h-7 shrink-0 items-center gap-1 rounded-full bg-sunken pl-3 pr-1 text-xs text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        className="flex size-5 items-center justify-center rounded-full text-tertiary transition-colors hover:bg-hover hover:text-ink"
      >
        <X className="size-3" />
      </button>
    </span>
  );
}

/**
 * One row of chips for the case's hard requirements. Chips that were not there when the screen
 * opened animate in, so a chat turn that adds filters is visible.
 */
export function FilterChips({ c }: { c: SourcingCase }) {
  const conditions = c.hardRequirements as FilterCondition[];
  const [seen] = useState(() => new Set(conditions.map(conditionKey)));

  const remove = (key: string, label: string) =>
    setHardRequirements(
      c.id,
      conditions.filter((x) => conditionKey(x) !== key),
      CURRENT_USER.name,
      `removed ${label}`,
    );

  // No chips, no row: the opening message says there are no filters yet.
  if (conditions.length === 0) return null;
  return (
    <div data-filter-bar aria-label="Filters" className="flex items-center justify-center gap-1.5 overflow-x-auto px-4 py-2.5">
      {conditions.map((x) => {
        const key = conditionKey(x);
        return <Chip key={key} condition={x} animate={!seen.has(key)} onRemove={() => remove(key, conditionLabel(x))} />;
      })}
    </div>
  );
}
