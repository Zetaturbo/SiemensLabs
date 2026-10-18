"use client";
import { useCallback, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { conditionKey, conditionLabel } from "@/components/ui-blocks/condition-label";
import { CURRENT_USER } from "@/components/case/ui-store";
import { setHardRequirements } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import type { FilterCondition } from "@/lib/data-api/types";

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
    <span ref={ref} data-filter-chip className="inline-flex h-8 shrink-0 items-center gap-0.5 rounded-full border border-line bg-surface pl-3 pr-1 text-sm text-ink">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter ${label}`}
        title="Remove filter"
        className="flex size-6 items-center justify-center rounded-full text-subtext outline-none transition-colors hover:bg-active hover:text-ink focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
      >
        <X className="size-3.5" />
      </button>
    </span>
  );
}

/**
 * The board's filter row: the case's hard requirements as removable chips (outlined, with an x button that has its own
 * hover and focus ring), then `children` (the "Edit filters" control). Same writes as the case chat's chip bar; chips
 * that were not there when the board opened animate in, so a filter added from the chat is visible.
 */
export function BoardFilterChips({ c, children }: { c: SourcingCase; children?: ReactNode }) {
  const conditions = c.hardRequirements as FilterCondition[];
  const [seen] = useState(() => new Set(conditions.map(conditionKey)));
  const remove = (key: string, label: string) =>
    setHardRequirements(
      c.id,
      conditions.filter((x) => conditionKey(x) !== key),
      CURRENT_USER.name,
      `removed ${label}`,
    );
  return (
    <div data-filter-bar aria-label="Filters" className="flex flex-wrap items-center gap-1.5">
      {conditions.map((x) => {
        const key = conditionKey(x);
        return <Chip key={key} condition={x} animate={!seen.has(key)} onRemove={() => remove(key, conditionLabel(x))} />;
      })}
      {conditions.length === 0 && <span className="text-sm text-tertiary">No filters</span>}
      {children}
    </div>
  );
}
