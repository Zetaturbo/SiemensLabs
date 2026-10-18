"use client";
import { useState } from "react";
import { Button, Modal, Textarea } from "@/design-system/react";
import { dropWithReason } from "@/lib/cases/actions";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "@/components/case/ui-store";

export const DROP_REASONS = [
  "Fails a knock-out criterion",
  "Higher risk than comparable alternatives",
  "Insufficient delivery performance",
  "Quality or safety concern",
  "Compliance or governance concern",
  "Financial stability concern",
  "Capacity or volume mismatch",
  "Other",
];

/**
 * Exclusion with a documented reason (required for the award file). The reason is stored in the
 * case log as "dropped <id>: <reason>" and shows up in the memo.
 */
export function DropDialog({ caseId, supplierId, supplierName, onClose }: { caseId: string; supplierId: string | null; supplierName: string; onClose: () => void }) {
  const [reason, setReason] = useState<string | null>(null);
  const [detail, setDetail] = useState("");
  const needsDetail = reason === "Other";
  const valid = !!reason && (!needsDetail || detail.trim().length > 2);
  const close = () => {
    setReason(null);
    setDetail("");
    onClose();
  };
  return (
    <Modal
      open={!!supplierId}
      onClose={close}
      title={`Drop ${supplierName}`}
      description="Exclusion reasons are part of the award documentation."
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!valid}
            onClick={() => {
              if (!supplierId || !reason) return;
              const text = needsDetail ? detail.trim() : detail.trim() ? `${reason} (${detail.trim()})` : reason;
              dropWithReason(caseId, supplierId, text, CURRENT_USER.name);
              close();
            }}
          >
            Drop supplier
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Reason" className="grid gap-1">
        {DROP_REASONS.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={reason === r}
            onClick={() => setReason(r)}
            className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition-colors", reason === r ? "bg-selected text-ink" : "text-subtext hover:bg-hover hover:text-ink")}
          >
            <span className={cn("size-3.5 rounded-full border", reason === r ? "border-[5px] border-ink" : "border-strong")} />
            {r}
          </button>
        ))}
      </div>
      <Textarea
        className="mt-3"
        rows={2}
        placeholder={needsDetail ? "Describe the reason (required)" : "Details (optional)"}
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        invalid={needsDetail && detail.trim().length > 0 && detail.trim().length <= 2}
      />
    </Modal>
  );
}
