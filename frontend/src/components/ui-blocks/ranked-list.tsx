"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Button } from "@/design-system/react";
import { formatValue, labelOf, levelFor, num, signed, str } from "./fields";
import { BETTER, BlockEmpty, BlockFrame, LevelChip, Num, PinButton, RiskBar, SupplierLink, WORSE, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

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

/** filter_suppliers { total_matching, suppliers }, rank_with_profile { ranking }, find_similar { similar }, or a plain array. */
export function toRankedRows(data: unknown): { kind: Kind; rows: Row[]; total: number | null; profileId: string | null; reference: string | null } {
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
      differences:
        r.differences && typeof r.differences === "object"
          ? Object.entries(r.differences as Rec).flatMap(([k, v]) => (num(v) === null ? [] : [[k, num(v)!] as [string, number]]))
          : [],
      contributors: Array.isArray(r.top_contributors)
        ? (r.top_contributors as Rec[]).flatMap((c) => (typeof c?.field === "string" && num(c.contribution) !== null ? [{ field: c.field, contribution: num(c.contribution)! }] : []))
        : [],
    }));
  return { kind, rows, total: num(d.total_matching), profileId: str(d.profile_id), reference: str(d.reference) };
}

function RankChange({ value }: { value: number | null }) {
  if (value === null) return null;
  if (value === 0) return <Num className="text-2xs text-tertiary">±0</Num>;
  return (
    <Num className={cn("text-2xs", value > 0 ? BETTER : WORSE)}>
      <span title="Rank change vs the default profile">
        {value > 0 ? "▲" : "▼"}
        {Math.abs(value)}
      </span>
    </Num>
  );
}

export function RankedListView({ resultId, data, title, limit }: { resultId?: string | null; data?: unknown; title?: string | null; limit?: number | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <WithResult block="ranked-list" resultId={resultId} data={data} title={title ?? undefined} skeletonRows={5}>
      {(value) => {
        const { kind, rows, total, profileId, reference } = toRankedRows(value);
        if (rows.length === 0) return <BlockEmpty block="ranked-list" title={title ?? "Suppliers"} message="No suppliers match these requirements." />;
        const cap = limit && limit > 0 ? limit : 10;
        const shown = expanded ? rows : rows.slice(0, cap);
        const fmt = (n: number) => n.toLocaleString("en-GB");
        const heading =
          title ??
          (kind === "rank"
            ? `Ranked with profile ${profileId ?? "default"}`
            : kind === "similar"
              ? `Similar to ${reference ?? "the reference"}`
              : total !== null
                ? `${fmt(total)} suppliers match`
                : "Suppliers");
        const sub =
          kind === "rank"
            ? `Profile score: lower is better. Arrows: rank change vs the default ranking.${total !== null ? ` Top ${rows.length} of ${fmt(total)}.` : ""}`
            : kind === "similar"
              ? "Distance on the 18 risk scores; differences vs the reference."
              : total !== null && total > rows.length
                ? `Showing ${rows.length} of ${fmt(total)}, lowest total risk first.`
                : undefined;
        return (
          <BlockFrame block="ranked-list" title={heading} subtitle={sub}>
            <ol className="-mx-1 divide-y divide-subtle">
              {shown.map((r) => {
                const level = levelFor(r.rec, "total_risk_index");
                const delivery = num(r.rec.delivery_rating);
                const hasMeta = r.contributors.length > 0 || r.differences.length > 0 || delivery !== null || r.distance !== null;
                return (
                  <li key={r.id} className="flex items-center gap-2 px-1 py-1.5">
                    <Num className="w-5 shrink-0 text-right text-2xs text-tertiary">{r.rank}</Num>
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-baseline gap-1.5">
                        <SupplierLink id={r.id} className="font-medium">
                          {r.name ?? r.id}
                        </SupplierLink>
                        {r.name && <span className="shrink-0 font-mono text-2xs text-tertiary">{r.id}</span>}
                        {kind === "rank" && <RankChange value={r.rankChange} />}
                      </div>
                      {hasMeta && (
                        <div className="mt-0.5 flex flex-wrap gap-x-2 text-2xs text-subtext">
                          {r.contributors.slice(0, 3).map((c) => (
                            <span key={c.field}>
                              {labelOf(c.field)} <Num>{c.contribution.toFixed(1)}</Num>
                            </span>
                          ))}
                          {r.distance !== null && (
                            <span>
                              distance <Num>{r.distance.toFixed(1)}</Num>
                            </span>
                          )}
                          {r.differences.map(([f, v]) => (
                            <span key={f}>
                              {labelOf(f)} <Num className={v < 0 ? BETTER : WORSE}>{signed(v, 0)}</Num>
                            </span>
                          ))}
                          {kind !== "rank" && delivery !== null && (
                            <span>
                              delivery <Num>{formatValue("delivery_rating", delivery)}</Num>
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    {kind === "rank" && r.profileScore !== null && (
                      <span className="shrink-0 text-right" title="Profile score">
                        <Num className="block text-xs font-semibold">{r.profileScore.toFixed(1)}</Num>
                        <span className="block text-[10px] uppercase tracking-wide text-tertiary">profile</span>
                      </span>
                    )}
                    <span className="flex shrink-0 items-center gap-1.5" title="Total risk index">
                      <RiskBar value={r.tri} level={level} width="w-16" />
                      <LevelChip level={level} className="w-[60px]" />
                    </span>
                    <PinButton supplierId={r.id} />
                  </li>
                );
              })}
            </ol>
            {rows.length > cap && (
              <Button variant="link" size="sm" className="mt-1 text-xs" onClick={() => setExpanded((e) => !e)}>
                {expanded ? "Show fewer" : `Show all ${rows.length}`}
              </Button>
            )}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RankedListBlock: ComponentRenderer<BlockProps<"RankedList">> = ({ props }) => (
  <RankedListView resultId={props.resultId} title={props.title} limit={props.limit} />
);
