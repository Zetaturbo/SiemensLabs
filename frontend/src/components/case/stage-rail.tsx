"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Check, MessageSquare, RotateCcw } from "lucide-react";
import { Avatar, Badge, ConfirmModal, IconButton, Select, Tooltip } from "@/design-system/react";
import type { SourcingCase, Stage } from "@/lib/cases/types";
import { resetCase, setProfile, stageIndex } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import { partById, supplierName, useProfiles, useSupplierRows } from "./case-context";
import type { FilterResult } from "./domain";
import type { CaseView } from "./chat-slot";
import { MockBadge, Spinner } from "./primitives";
import { CURRENT_USER } from "./ui-store";

const STAGES: Array<{ stage: Stage; label: string; view: CaseView; href: string }> = [
  { stage: "long_list", label: "Long list", view: "explorer", href: "" },
  { stage: "shortlist", label: "Shortlist", view: "shortlist", href: "/shortlist" },
  { stage: "finalists", label: "Finalists", view: "finalists", href: "/finalists" },
  { stage: "awarded", label: "Awarded", view: "memo", href: "/memo" },
];

/** Case header: part, profile, owner, and the four stages with counts (links to each stage view). */
export function StageRail({ c, view, chatOpen, onToggleChat }: { c: SourcingCase; view: CaseView; chatOpen: boolean; onToggleChat: () => void }) {
  const part = partById(c.partId);
  const { profiles } = useProfiles();
  const longList = useDataTool<FilterResult>("filter_suppliers", { conditions: c.hardRequirements, limit: 1, fields: ["supplier_id"] });
  const longCount = typeof longList.data?.total_matching === "number" ? longList.data.total_matching : undefined;
  const { rows } = useSupplierRows(c.awardedSupplier ? [c.awardedSupplier] : []);
  const base = `/cases/${c.id}`;
  const current = stageIndex(c.stage);
  const [confirmReset, setConfirmReset] = useState(false);

  const counts: Record<string, ReactNode> = {
    long_list: longList.loading && longCount === undefined ? <Spinner /> : longCount !== undefined ? longCount.toLocaleString("en-US") : "–",
    shortlist: `${c.shortlist.length}/20`,
    finalists: String(c.finalists.length),
    awarded: c.awardedSupplier ? supplierName(rows, c.awardedSupplier) : "–",
  };

  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-subtle bg-surface px-4 py-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-md font-semibold tracking-[-0.01em]">{part?.label ?? c.partId}</h1>
            {part?.criticality && (
              <Badge size="sm" tone={part.criticality === "safety" ? "danger" : "outline"}>
                {part.criticality === "safety" ? "safety-critical" : part.criticality}
              </Badge>
            )}
          </div>
          <div className="font-mono text-2xs text-tertiary">{c.id}</div>
        </div>
        <Select
          size="sm"
          align="start"
          aria-label="Weight profile"
          value={c.profileId}
          onValueChange={(v) => setProfile(c.id, v, CURRENT_USER.name)}
          options={profiles.map((p) => ({ value: p.profile_id, label: p.label }))}
          className="max-w-56"
        />
      </div>

      <nav aria-label="Case stages" className="flex flex-1 justify-center">
        <ol className="flex items-center">
          {STAGES.map((s, i) => {
            const idx = stageIndex(s.stage);
            const done = idx < current;
            const isCurrent = idx === current;
            const viewing = s.view === view;
            return (
              <li key={s.stage} className="flex items-center">
                {i > 0 && <span aria-hidden className={cn("mx-1 h-px w-5", done || isCurrent ? "bg-ink" : "bg-line")} />}
                <Link
                  href={`${base}${s.href}`}
                  aria-current={viewing ? "page" : undefined}
                  className={cn("flex h-8 items-center gap-2 rounded-lg px-2.5 text-sm transition-colors", viewing ? "bg-selected text-ink" : "text-subtext hover:bg-hover hover:text-ink")}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full font-mono text-[10px] font-semibold",
                      done ? "bg-ink text-inverse" : isCurrent ? "bg-ink text-inverse ring-2 ring-[var(--lw-focus-ring)]" : "border border-line text-tertiary",
                    )}
                  >
                    {done ? <Check className="size-2.5" strokeWidth={3} /> : i + 1}
                  </span>
                  <span className={cn("font-medium", (viewing || isCurrent) && "text-ink")}>{s.label}</span>
                  <span className="max-w-40 truncate font-mono text-xs tabular-nums text-tertiary">{counts[s.stage]}</span>
                  {isCurrent && <span className="sr-only">(current stage)</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-1.5">
        <MockBadge meta={longList.meta} />
        {c.owner ? (
          <span className="flex items-center gap-1.5 rounded-full border border-subtle py-0.5 pl-0.5 pr-2.5 text-xs" title={`Owner: ${c.owner.name}, ${c.owner.department}`}>
            <Avatar name={c.owner.name} size="xs" className="rounded-full" />
            <span className="font-medium text-ink">{c.owner.name}</span>
            <span className="text-tertiary">{c.owner.department}</span>
          </span>
        ) : (
          <Badge tone="outline" size="sm">
            Unassigned
          </Badge>
        )}
        <Tooltip label="Reset case (demo)" side="bottom">
          <IconButton
            aria-label="Reset case"
            size="sm"
            onClick={() => setConfirmReset(true)}
          >
            <RotateCcw />
          </IconButton>
        </Tooltip>
        <Tooltip label={chatOpen ? "Hide assistant" : "Show assistant"} side="bottom">
          <IconButton aria-label="Toggle assistant" size="sm" variant={chatOpen ? "subtle" : "ghost"} onClick={onToggleChat} className="hidden lg:inline-flex" aria-pressed={chatOpen}>
            <MessageSquare />
          </IconButton>
        </Tooltip>
      </div>
      <ConfirmModal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        onConfirm={() => {
          resetCase(c.id, CURRENT_USER.name);
          setConfirmReset(false);
        }}
        tone="warning"
        title="Reset this case?"
        description="Requirements, shortlist, finalists and award are cleared. The case log keeps the history."
        confirmLabel="Reset case"
      />
    </header>
  );
}
