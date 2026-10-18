"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { parseCompare } from "./compare-grid";
import { FAMILY_LABEL, num, str } from "./fields";
import { BlockEmpty, BlockFrame, Num, SupplierLink, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/** Most suppliers drawn; one small radar each, so every chart has a single series and needs no legend. */
const MAX_SERIES = 6;

/** Axis order around the radar: the long "Supply chain" label sits bottom left, not at the clipped left edge. */
const AXIS_ORDER = ["financial", "operational_quality", "compliance_governance", "supply_chain_structure", "external_environment"] as const;

const SHORT: Record<string, string> = {
  financial: "Financial",
  operational_quality: "Quality",
  compliance_governance: "Compliance",
  external_environment: "External",
  supply_chain_structure: "Supply chain",
};

interface Point {
  family: string;
  full: string;
  value: number | null;
  /** Plotted value: a missing score sits at the centre. */
  plot: number;
}

function PointTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload?: Point }> }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink shadow-md">
      {p.full} <Num className="ml-1 font-semibold">{p.value === null ? "–" : p.value.toFixed(1)}</Num>
    </div>
  );
}

function MiniRadar({ points }: { points: Point[] }) {
  return (
    <div className="h-52">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={points} outerRadius="64%" margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
          <PolarGrid stroke="var(--lw-border-subtle)" />
          <PolarRadiusAxis domain={[0, 100]} tickCount={3} tick={false} axisLine={false} />
          <PolarAngleAxis dataKey="family" tick={{ fill: "var(--lw-text-secondary)", fontSize: 13 }} />
          <Radar dataKey="plot" stroke="var(--lw-text-primary)" fill="var(--lw-text-primary)" fillOpacity={0.08} strokeWidth={1.75} isAnimationActive={false} />
          <Tooltip content={<PointTooltip />} cursor={false} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function RadarProfileView({ resultId, data, supplierIds, title }: { resultId?: string | null; data?: unknown; supplierIds?: string[] | null; title?: string | null }) {
  return (
    <WithResult block="radar-profile" resultId={resultId} data={data} skeletonRows={6}>
      {(value) => {
        const { suppliers, familyScores } = parseCompare(value);
        const names = new Map(suppliers.map((s) => [s.supplier_id as string, str(s.supplier_name) ?? (s.supplier_id as string)]));
        const wanted = supplierIds?.length ? new Set(supplierIds) : null;
        const series = familyScores
          .filter((f) => typeof f.supplier_id === "string" && (!wanted || wanted.has(f.supplier_id as string)))
          .slice(0, MAX_SERIES) as Array<Rec & { supplier_id: string }>;
        if (series.length === 0) return <BlockEmpty block="radar-profile" title={title ?? "Risk profile"} message="This result has no family scores." />;
        const note = `Family scores, 0 at the centre to 100 at the edge; a smaller shape is less risk. Hover a corner for the value.${
          familyScores.length > series.length ? ` Showing ${series.length} of ${familyScores.length} suppliers.` : ""
        }`;
        return (
          <BlockFrame block="radar-profile" title={title ?? "Risk profile by family"} note={note}>
            <div className={cn("grid gap-x-4 gap-y-2", series.length === 1 ? "mx-auto max-w-sm" : "@md:grid-cols-2 @2xl:grid-cols-3")}>
              {series.map((s) => (
                <figure key={s.supplier_id} className="min-w-0">
                  <figcaption className="truncate text-center text-sm font-medium">
                    <SupplierLink id={s.supplier_id}>{names.get(s.supplier_id) ?? s.supplier_id}</SupplierLink>
                  </figcaption>
                  <MiniRadar points={AXIS_ORDER.map((fam) => ({ family: SHORT[fam], full: FAMILY_LABEL[fam], value: num(s[fam]), plot: num(s[fam]) ?? 0 }))} />
                </figure>
              ))}
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RadarProfileBlock: ComponentRenderer<BlockProps<"RadarProfile">> = ({ props }) => (
  <RadarProfileView resultId={props.resultId} supplierIds={props.supplierIds} title={props.title} />
);
