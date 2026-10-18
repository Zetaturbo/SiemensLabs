"use client";
import { useState } from "react";
import { ConfirmModal } from "@/design-system/react";
import { award } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";
import { cn } from "@/lib/utils";
import { supplierName, useSupplierRows } from "./case-context";
import { isLevel, levelOf, num } from "./domain";
import { CURRENT_USER } from "./ui-store";

/**
 * The award confirmation (the finalists view's dialog): pick one finalist, best-ranked preselected, and award it.
 * The case moves to Awarded and the log records the decision for the memo.
 */
export function AwardDialog({ c, ranked, open, onClose }: { c: SourcingCase; ranked: string[]; open: boolean; onClose: () => void }) {
  const finalists = [...c.finalists].sort((a, b) => rankOf(ranked, a) - rankOf(ranked, b));
  const { rows } = useSupplierRows(c.finalists);
  const [picked, setPicked] = useState<string | null>(null);
  const choice = picked && finalists.includes(picked) ? picked : (finalists[0] ?? null);

  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      onConfirm={() => {
        if (choice) {
          const r = rows[choice];
          const level = isLevel(r?.total_risk_index_level) ? r.total_risk_index_level : levelOf(num(r?.total_risk_index));
          award(c.id, choice, CURRENT_USER.name, level ?? undefined);
        }
        onClose();
      }}
      title={choice ? `Award ${supplierName(rows, choice)}?` : "Award"}
      description="The case moves to Awarded and the decision memo records it with the comparison and exclusion reasons."
      confirmLabel="Award supplier"
    >
      <fieldset className="flex flex-col gap-1" aria-label="Finalist to award">
        {finalists.map((id) => (
          <label
            key={id}
            className={cn("flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-hover", choice === id && "bg-sunken")}
          >
            <input type="radio" name="award" className="accent-[var(--lw-ink)]" checked={choice === id} onChange={() => setPicked(id)} />
            <span className="min-w-0 flex-1 truncate text-ink">{supplierName(rows, id)}</span>
            <span className="font-mono text-sm tabular-nums text-tertiary">{id}</span>
          </label>
        ))}
      </fieldset>
    </ConfirmModal>
  );
}

function rankOf(ranked: string[], id: string): number {
  const i = ranked.indexOf(id);
  return i < 0 ? 99 : i;
}
