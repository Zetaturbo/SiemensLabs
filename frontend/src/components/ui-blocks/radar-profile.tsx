"use client";
import { defineComponent } from "@openuidev/react-lang";
import { Legend, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { z } from "zod/v4";
import { parseCompare } from "./compare-grid";
import { FAMILIES, FAMILY_LABEL, num, str } from "./fields";
import { BlockEmpty, BlockFrame, WithResult } from "./primitives";

type Rec = Record<string, unknown>;

/** Distinguishable in light and dark mode. */
const SERIES = ["#0ea5e9", "#a855f7", "#f59e0b", "#10b981", "#f43f5e", "#64748b"];
const SHORT: Record<string, string> = {
  financial: "Financial",
  operational_quality: "Op. quality",
  compliance_governance: "Compliance",
  external_environment: "External",
  supply_chain_structure: "Supply chain",
};

export function RadarProfileView({ resultId, data, supplierIds, title }: { resultId?: string | null; data?: unknown; supplierIds?: string[] | null; title?: string | null }) {
  return (
    <WithResult block="radar-profile" resultId={resultId} data={data} skeletonRows={6}>
      {(value) => {
        const { suppliers, familyScores } = parseCompare(value);
        const names = new Map(suppliers.map((s) => [s.supplier_id as string, str(s.supplier_name) ?? (s.supplier_id as string)]));
        const wanted = supplierIds?.length ? new Set(supplierIds) : null;
        const series = familyScores
          .filter((f) => typeof f.supplier_id === "string" && (!wanted || wanted.has(f.supplier_id as string)))
          .slice(0, SERIES.length) as Array<Rec & { supplier_id: string }>;
        if (series.length === 0) return <BlockEmpty block="radar-profile" title={title ?? "Risk profile"} message="This result has no family scores." />;
        const rows = FAMILIES.map((fam) => {
          const row: Record<string, string | number | null> = { family: SHORT[fam], full: FAMILY_LABEL[fam] };
          for (const s of series) row[s.supplier_id] = num(s[fam]);
          return row;
        });
        return (
          <BlockFrame
            block="radar-profile"
            title={title ?? "Risk profile by family"}
            subtitle={`0 = no risk at the center, 100 = max risk at the edge.${familyScores.length > series.length ? ` Showing ${series.length} of ${familyScores.length}.` : ""}`}
          >
            <div className="h-72 text-zinc-500 dark:text-zinc-400">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={rows} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="currentColor" strokeOpacity={0.25} />
                  <PolarAngleAxis dataKey="family" tick={{ fill: "currentColor", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={90} tick={{ fill: "currentColor", fontSize: 9 }} stroke="currentColor" strokeOpacity={0.2} />
                  {series.map((s, i) => (
                    <Radar
                      key={s.supplier_id}
                      name={names.get(s.supplier_id) ?? s.supplier_id}
                      dataKey={s.supplier_id}
                      stroke={SERIES[i]}
                      fill={SERIES[i]}
                      fillOpacity={series.length > 2 ? 0.08 : 0.18}
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 6 }}
                    formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v ?? "–"))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RadarProfile = defineComponent({
  name: "RadarProfile",
  description:
    "Radar chart of the five risk-family scores (financial, operational quality, compliance and governance, external environment, supply chain structure) " +
    "for one or more suppliers. Use for compare_suppliers results to show profile shape.",
  props: z.object({
    resultId: z.string().describe("Handle of a compare_suppliers result (uses family_scores)"),
    supplierIds: z.array(z.string()).optional().describe("Optional subset of supplier ids to plot (max 6)"),
    title: z.string().optional().describe("Optional heading"),
  }),
  component: ({ props }) => <RadarProfileView resultId={props.resultId} supplierIds={props.supplierIds} title={props.title} />,
});
