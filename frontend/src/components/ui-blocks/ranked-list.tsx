"use client";
import { useState } from "react";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { formatValue, labelOf, levelFor, num, signed, str } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, PinButton, RiskBar, SupplierLink, WithResult, cx } from "./primitives";

type Rec = Record<string, unknown>;

interface Row {
  id: string;
  name: string | null;
  rank: number;
  tri: number | null;
  rec: Rec;
  profileScore: number | null;
  rankChange: number | null;
  distance: number | null;
  differences: Array<[string, number]>;
  contributors: Array<{ field: string; contribution: number }>;
}

type Kind = "filter" | "rank" | "similar" | "list";

function toRows(data: unknown): { kind: Kind; rows: Row[]; total: number | null; profileId: string | null; reference: string | null } {
  const d = (data ?? {}) as Rec;
  const kind: Kind = Array.isArray(d.ranking) ? "rank" : Array.isArray(d.similar) ? "similar" : Array.isArray(d.suppliers) ? "filter" : "list";
  const list = (kind === "rank" ? d.ranking : kind === "similar" ? d.similar : kind === "filter" ? d.suppliers : Array.isArray(data) ? data : []) as unknown[];
  const rows = list
    .filter((r): r is Rec => !!r && typeof r === "object" && typeof (r as Rec).supplier_id === "string")
    .map((r, i) => ({
      id: r.supplier_id as string,
      name: str(r.supplier_name),
      rank: num(r.rank) ?? i + 1,
      tri: num(r.total_risk_index),
      rec: r,
      profileScore: num(r.profile_score),
      rankChange: num(r.rank_change),
      distance: num(r.distance),
      differences: r.differences && typeof r.differences === "object" ? Object.entries(r.differences as Rec).flatMap(([k, v]) => (num(v) === null ? [] : [[k, num(v)!] as [string, number]])) : [],
      contributors: Array.isArray(r.top_contributors)
        ? (r.top_contributors as Rec[]).flatMap((c) => (typeof c?.field === "string" && num(c.contribution) !== null ? [{ field: c.field, contribution: num(c.contribution)! }] : []))
        : [],
    }));
  return { kind, rows, total: num(d.total_matching), profileId: str(d.profile_id), reference: str(d.reference) };
}

function RankChange({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <span className="text-[10px] text-zinc-400">±0</span>;
  return (
    <span className={cx("font-mono text-[10px] tabular-nums", value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")} title="Rank change vs the default profile">
      {value > 0 ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function RankedListView({ resultId, data, title, limit }: { resultId?: string | null; data?: unknown; title?: string | null; limit?: number | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <WithResult block="ranked-list" resultId={resultId} data={data} title={title ?? undefined} skeletonRows={5}>
      {(value) => {
        const { kind, rows, total, profileId, reference } = toRows(value);
        if (rows.length === 0) return <BlockEmpty block="ranked-list" title={title ?? "Suppliers"} message="No suppliers match these requirements." />;
        const cap = limit && limit > 0 ? limit : 10;
        const shown = expanded ? rows : rows.slice(0, cap);
        const heading =
          title ??
          (kind === "rank" ? `Ranked with profile ${profileId ?? "default"}` : kind === "similar" ? `Similar to ${reference ?? "the reference"}` : total !== null ? `${total.toLocaleString("en-GB")} suppliers match` : "Suppliers");
        const sub =
          kind === "filter" && total !== null && total > rows.length
            ? `Showing ${rows.length} of ${total.toLocaleString("en-GB")}`
            : kind === "rank"
              ? "Profile score: 0 = no risk, lower is better. Arrows show the change vs the default ranking."
              : kind === "similar"
                ? "Distance on the 18 risk scores; differences vs the reference."
                : undefined;
        return (
          <BlockFrame block="ranked-list" title={heading} subtitle={sub}>
            <ol className="-mx-1 divide-y divide-zinc-100 dark:divide-zinc-800">
              {shown.map((r) => {
                const level = levelFor(r.rec, "total_risk_index");
                const delivery = num(r.rec.delivery_rating);
                return (
                  <li key={r.id} className="flex items-center gap-2 px-1 py-1.5">
                    <span className="w-5 shrink-0 text-right font-mono text-[11px] text-zinc-400 tabular-nums">{r.rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <SupplierLink id={r.id}>
                          <span className="font-medium">{r.name ?? r.id}</span>
                        </SupplierLink>
                        {r.name && <span className="shrink-0 font-mono text-[10px] text-zinc-400">{r.id}</span>}
                        {kind === "rank" && <RankChange value={r.rankChange} />}
                      </div>
                      {(r.contributors.length > 0 || r.differences.length > 0 || delivery !== null || r.distance !== null) && (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-zinc-500 dark:text-zinc-400">
                          {r.contributors.slice(0, 3).map((c) => (
                            <span key={c.field}>
                              {labelOf(c.field)} <span className="font-mono tabular-nums">{c.contribution.toFixed(1)}</span>
                            </span>
                          ))}
                          {r.distance !== null && <span>distance <span className="font-mono tabular-nums">{r.distance.toFixed(1)}</span></span>}
                          {r.differences.map(([f, v]) => (
                            <span key={f} className={v < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}>
                              {labelOf(f)} <span className="font-mono tabular-nums">{signed(v, 0)}</span>
                            </span>
                          ))}
                          {kind !== "rank" && delivery !== null && <span>delivery {formatValue("delivery_rating", delivery)}</span>}
                        </div>
                      )}
                    </div>
                    {kind === "rank" && r.profileScore !== null && (
                      <span className="shrink-0 text-right" title="Profile score">
                        <span className="block font-mono text-xs font-semibold tabular-nums">{r.profileScore.toFixed(1)}</span>
                        <span className="block text-[9px] uppercase tracking-wide text-zinc-400">profile</span>
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1.5" title="Total risk index">
                      <RiskBar value={r.tri} level={level} width="w-16" />
                      <LevelChip level={level} className="w-[58px] justify-center" />
                    </span>
                    <PinButton supplierId={r.id} />
                  </li>
                );
              })}
            </ol>
            {rows.length > cap && (
              <button type="button" onClick={() => setExpanded((e) => !e)} className="mt-1 text-xs font-medium text-sky-700 hover:underline dark:text-sky-400">
                {expanded ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            )}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RankedList = defineComponent({
  name: "RankedList",
  description:
    "Ranked supplier list with an inline total-risk bar, level chip and a pin-to-shortlist button per row. " +
    "Use for filter_suppliers, rank_with_profile (shows profile score and rank change) and find_similar results.",
  props: z.object({
    resultId: z.string().describe("Handle of a filter_suppliers, rank_with_profile or find_similar result"),
    title: z.string().optional().describe("Optional heading; defaults to the match count or profile"),
    limit: z.number().optional().describe("Rows shown before 'Show all' (default 10)"),
  }),
  component: ({ props }) => <RankedListView resultId={props.resultId} title={props.title} limit={props.limit} />,
});
