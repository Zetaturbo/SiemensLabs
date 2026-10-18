"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import type { SourcingCase, Stage } from "@/lib/cases/types";
import { resetCase, setProfile, stageIndex } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { partById, supplierName, useProfiles, useSupplierRows } from "./case-context";
import type { FilterResult } from "./domain";
import type { CaseView } from "./chat-slot";
import { Badge, MockBadge, Spinner, cx, ui } from "./primitives";
import { CURRENT_USER } from "./ui-store";

const STAGES: Array<{ stage: Stage; label: string; view: CaseView; href: string }> = [
  { stage: "long_list", label: "Long list", view: "explorer", href: "" },
  { stage: "shortlist", label: "Shortlist", view: "shortlist", href: "/shortlist" },
  { stage: "finalists", label: "Finalists", view: "finalists", href: "/finalists" },
  { stage: "awarded", label: "Awarded", view: "memo", href: "/memo" },
];

export function StageRail({ c, view, chatOpen, onToggleChat }: { c: SourcingCase; view: CaseView; chatOpen: boolean; onToggleChat: () => void }) {
  const part = partById(c.partId);
  const { profiles } = useProfiles();
  const profile = profiles.find((p) => p.profile_id === c.profileId);
  const longList = useDataTool<FilterResult>("filter_suppliers", { conditions: c.hardRequirements, limit: 1, fields: ["supplier_id"] });
  const longCount = typeof longList.data?.total_matching === "number" ? longList.data.total_matching : undefined;
  const { rows } = useSupplierRows(c.awardedSupplier ? [c.awardedSupplier] : []);
  const base = `/cases/${c.id}`;
  const current = stageIndex(c.stage);

  const counts: Record<string, ReactNode> = {
    long_list: longList.loading && longCount === undefined ? <Spinner /> : longCount !== undefined ? longCount.toLocaleString("en-US") : "–",
    shortlist: `${c.shortlist.length}/20`,
    finalists: c.finalists.length,
    awarded: c.awardedSupplier ? supplierName(rows, c.awardedSupplier) : "–",
  };

  return (
    <header className={cx("flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2", ui.border, "bg-white dark:bg-zinc-950")}>
      <div className="flex min-w-0 items-center gap-3">
        <Link href="/train" className={cx(ui.btnGhost, "px-1.5")} title="Back to the train map">
          ← Train
        </Link>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-sm font-semibold">{part?.label ?? c.partId}</h1>
            {part?.criticality && <Badge tone={part.criticality === "safety" ? "red" : "neutral"}>{part.criticality}</Badge>}
          </div>
          <div className={cx("flex items-center gap-2 text-[11px]", ui.muted)}>
            <span className="font-mono">{c.id}</span>
            <span aria-hidden>·</span>
            <label className="flex items-center gap-1">
              <span className="sr-only">Profile</span>
              <select
                value={c.profileId}
                onChange={(e) => setProfile(c.id, e.target.value, CURRENT_USER.name)}
                className="rounded border-0 bg-transparent p-0 pr-4 text-[11px] font-medium text-zinc-700 focus:ring-1 focus:ring-blue-500 dark:text-zinc-200"
                title={profile?.description}
              >
                {profiles.map((p) => (
                  <option key={p.profile_id} value={p.profile_id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </div>

      <nav aria-label="Case stages" className="flex flex-1 items-stretch justify-center">
        <ol className="flex items-stretch gap-1">
          {STAGES.map((s, i) => {
            const idx = stageIndex(s.stage);
            const done = idx < current;
            const isCurrent = idx === current;
            const viewing = s.view === view;
            return (
              <li key={s.stage} className="flex items-center gap-1">
                {i > 0 && <span className={cx("h-px w-4", done || isCurrent ? "bg-blue-500" : "bg-zinc-300 dark:bg-zinc-700")} aria-hidden />}
                <Link
                  href={`${base}${s.href}`}
                  aria-current={viewing ? "page" : undefined}
                  className={cx(
                    "flex items-center gap-2 rounded-md border px-2.5 py-1 text-xs transition-colors",
                    viewing ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : cx(ui.border, "hover:bg-zinc-50 dark:hover:bg-zinc-900"),
                  )}
                >
                  <span
                    className={cx(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold",
                      done ? "bg-blue-600 text-white" : isCurrent ? "bg-blue-600 text-white ring-2 ring-blue-300 dark:ring-blue-800" : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
                    )}
                    aria-hidden
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span className="font-medium">{s.label}</span>
                  <span className={cx("max-w-[10rem] truncate tabular-nums", ui.muted)}>{counts[s.stage]}</span>
                  {isCurrent && <span className="sr-only">(current stage)</span>}
                </Link>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center gap-2">
        <MockBadge meta={longList.meta} />
        {c.owner ? (
          <span className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-0.5 pl-0.5 pr-2 text-[11px] dark:border-zinc-800" title={`Owner: ${c.owner.name}, ${c.owner.department}`}>
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] font-semibold text-white">
              {c.owner.name
                .split(/\s+/)
                .map((p) => p[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span className="font-medium">{c.owner.name}</span>
            <span className={ui.muted}>{c.owner.department}</span>
          </span>
        ) : (
          <Badge>Unassigned</Badge>
        )}
        <button
          type="button"
          className={ui.btnGhost}
          onClick={() => {
            if (window.confirm("Reset this case to an empty long list? The log keeps the history.")) resetCase(c.id, CURRENT_USER.name);
          }}
          title="Reset case (demo)"
        >
          Reset
        </button>
        <button type="button" className={cx(ui.btn, "hidden lg:inline-flex")} onClick={onToggleChat} aria-pressed={chatOpen}>
          {chatOpen ? "Hide chat" : "Chat"}
        </button>
      </div>
    </header>
  );
}
