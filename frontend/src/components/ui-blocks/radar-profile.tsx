"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { parseCompare } from "./compare-grid";
import { FAMILIES, FAMILY_LABEL, num, str } from "./fields";
import { BlockEmpty, BlockFrame, Num, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

/**
 * Color is reserved for risk status, so suppliers are told apart by graphite tone and dash pattern.
 * The legend below the chart repeats the pattern.
 */
const SERIES = [
  { stroke: "var(--lw-text-primary)", dash: undefined, fillOpacity: 0.1 },
  { stroke: "var(--lw-gray-500)", dash: "6 3", fillOpacity: 0.06 },
  { stroke: "var(--lw-gray-400)", dash: "2 3", fillOpacity: 0.04 },
  { stroke: "var(--lw-gray-700)", dash: "10 3 2 3", fillOpacity: 0.04 },
  { stroke: "var(--lw-gray-300)", dash: undefined, fillOpacity: 0.03 },
  { stroke: "var(--lw-gray-600)", dash: "1 2", fillOpacity: 0.03 },
];
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
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={rows} outerRadius="72%" margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
                  <PolarGrid stroke="var(--lw-border)" />
                  <PolarAngleAxis dataKey="family" tick={{ fill: "var(--lw-text-secondary)", fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={90} tick={{ fill: "var(--lw-text-tertiary)", fontSize: 10 }} stroke="var(--lw-border)" />
                  {series.map((s, i) => (
                    <Radar
                      key={s.supplier_id}
                      name={names.get(s.supplier_id) ?? s.supplier_id}
                      dataKey={s.supplier_id}
                      stroke={SERIES[i].stroke}
                      strokeDasharray={SERIES[i].dash}
                      fill={SERIES[i].stroke}
                      fillOpacity={SERIES[i].fillOpacity}
                      strokeWidth={1.75}
                      isAnimationActive={false}
                    />
                  ))}
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, background: "var(--lw-surface)", border: "1px solid var(--lw-border)", color: "var(--lw-text-primary)" }}
                    formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v ?? "–"))}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink">
              {series.map((s, i) => (
                <li key={s.supplier_id} className="flex items-center gap-1.5">
                  <svg width="22" height="6" aria-hidden>
                    <line x1="1" y1="3" x2="21" y2="3" style={{ stroke: SERIES[i].stroke }} strokeWidth="2" strokeDasharray={SERIES[i].dash} />
                  </svg>
                  {names.get(s.supplier_id)}
                  <span className="font-mono text-2xs text-tertiary">{s.supplier_id}</span>
                </li>
              ))}
            </ul>
            <table className="mt-2 w-full border-t border-subtle text-2xs">
              <thead>
                <tr>
                  <th className="pt-2 text-left font-medium text-tertiary">Supplier</th>
                  {FAMILIES.map((fam) => (
                    <th key={fam} className="pt-2 text-right font-medium text-tertiary" title={FAMILY_LABEL[fam]}>
                      {SHORT[fam]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {series.map((s) => (
                  <tr key={s.supplier_id}>
                    <td className="max-w-28 truncate pr-2 text-ink">{names.get(s.supplier_id)}</td>
                    {FAMILIES.map((fam) => (
                      <td key={fam} className="text-right">
                        <Num className="text-ink">{num(s[fam])?.toFixed(1) ?? "–"}</Num>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RadarProfileBlock: ComponentRenderer<BlockProps<"RadarProfile">> = ({ props }) => (
  <RadarProfileView resultId={props.resultId} supplierIds={props.supplierIds} title={props.title} />
);
