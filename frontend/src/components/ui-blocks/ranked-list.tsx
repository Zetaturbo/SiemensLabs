"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { FIELD_META, formatValue, labelOf, levelFor, levelOf, lowerLabel, num, str } from "./fields";
import { BlockEmpty, BlockFrame, MoreButton, Num, PinButton, RiskBar, SupplierLink, WithResult } from "./primitives";
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

/** Rows shown before "Show all" when the model gives no limit. */
export const RANKED_LIST_CAP = 8;

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

const SCORE_FIELDS = Object.entries(FIELD_META)
  .filter(([, m]) => m.family)
  .map(([k]) => k);

const lower = lowerLabel;

/** One short reason per row, in words: what drives the score, or how it differs from the reference. */
function reasonOf(kind: Kind, r: Row): string | null {
  if (kind === "rank") {
    const top = [...r.contributors].sort((a, b) => b.contribution - a.contribution)[0];
    return top ? `Mostly ${lower(top.field)}` : null;
  }
  if (kind === "similar") {
    const best = [...r.differences].sort((a, b) => a[1] - b[1])[0];
    if (!best) return null;
    const [field, delta] = best;
    return delta === 0 ? `Same ${lower(field)}` : `${labelOf(field)} ${Math.abs(delta)} ${delta < 0 ? "lower" : "higher"}`;
  }
  // Filter results carry every score: name the weakest dimension when it is High or Critical, else the delivery rating.
  const worst = SCORE_FIELDS.map((f) => ({ f, v: num(r.rec[f]) }))
    .filter((x): x is { f: string; v: number } => x.v !== null)
    .sort((a, b) => b.v - a.v)[0];
  const worstLevel = worst ? (levelFor(r.rec, worst.f) ?? levelOf(worst.v)) : null;
  if (worst && (worstLevel === "High" || worstLevel === "Critical")) return `Weakest on ${lower(worst.f)}`;
  const delivery = num(r.rec.delivery_rating);
  if (delivery !== null) return `Delivery ${formatValue("delivery_rating", delivery)}`;
  return worst ? `Weakest on ${lower(worst.f)}` : null;
}

function rowTooltip(kind: Kind, r: Row): string {
  const parts = [r.id];
  if (kind === "rank" && r.rankChange !== null) parts.push(r.rankChange === 0 ? "same rank as the default profile" : `${Math.abs(r.rankChange)} places ${r.rankChange > 0 ? "up" : "down"} vs the default profile`);
  if (kind === "rank" && r.tri !== null) parts.push(`total risk index ${r.tri}`);
  if (r.distance !== null) parts.push(`distance ${r.distance.toFixed(1)}`);
  return parts.join(", ");
}

export function RankedListView({ resultId, data, title, limit }: { resultId?: string | null; data?: unknown; title?: string | null; limit?: number | null }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <WithResult block="ranked-list" resultId={resultId} data={data} title={title ?? undefined} skeletonRows={5}>
      {(value) => {
        const { kind, rows, total, profileId, reference } = toRankedRows(value);
        const cap = limit && limit > 0 ? limit : RANKED_LIST_CAP;
        const shown = expanded ? rows : rows.slice(0, cap);
        const fmt = (n: number) => n.toLocaleString("en-GB");
        const heading =
          title ??
          (kind === "rank"
            ? `Ranked with the ${(profileId ?? "default").replace(/_/g, " ")} profile`
            : kind === "similar"
              ? `Similar to ${reference ?? "the reference"}`
              : total !== null && rows.length > 0
                ? `${fmt(total)} supplier${total === 1 ? "" : "s"} match`
                : "Suppliers");
        if (rows.length === 0)
          return <BlockEmpty block="ranked-list" title={heading} message={kind === "similar" ? "No similar suppliers found." : "No suppliers match these requirements."} />;
        const note =
          kind === "rank"
            ? "Bar: profile score, 0 to 100, lower is better. Hover a row for the rank change against the default profile."
            : kind === "similar"
              ? "Distance on the 18 risk scores. Bar: total risk index."
              : `Bar: total risk index, 0 to 100, lower is better.${total !== null && total > rows.length ? ` The result holds the first ${rows.length} of ${fmt(total)}.` : ""}`;
        return (
          <BlockFrame block="ranked-list" title={heading} note={note}>
            <ol className="-mx-2">
              {shown.map((r) => {
                const score = kind === "rank" ? r.profileScore : r.tri;
                const level = kind === "rank" ? levelOf(r.profileScore) : levelFor(r.rec, "total_risk_index");
                const reason = reasonOf(kind, r);
                return (
                  <li key={r.id} className="group flex min-h-10 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-hover" title={rowTooltip(kind, r)}>
                    <Num className="w-6 shrink-0 text-right text-sm text-tertiary">{r.rank}</Num>
                    <div className="min-w-0 flex-1 @lg:grid @lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] @lg:items-center @lg:gap-4">
                      <SupplierLink id={r.id} className="block text-sm font-medium">
                        {r.name ?? r.id}
                      </SupplierLink>
                      {reason && <p className="truncate text-sm text-subtext">{reason}</p>}
                    </div>
                    <RiskBar value={score} level={level} width="w-20 @md:w-28" digits={kind === "rank" ? 1 : undefined} className="shrink-0" />
                    <PinButton supplierId={r.id} reveal />
                  </li>
                );
              })}
            </ol>
            {rows.length > cap && <MoreButton onClick={() => setExpanded((e) => !e)}>{expanded ? "Show fewer" : `Show all ${rows.length}`}</MoreButton>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RankedListBlock: ComponentRenderer<BlockProps<"RankedList">> = ({ props }) => (
  <RankedListView resultId={props.resultId} title={props.title} limit={props.limit} />
);
