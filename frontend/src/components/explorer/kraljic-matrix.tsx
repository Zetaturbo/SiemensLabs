"use client";
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { fmtEur, num, type KraljicResult } from "@/components/case/domain";
import { CHART } from "@/components/case/chart-theme";
import { ErrorNote } from "@/components/case/primitives";

const RISK_Y: Record<string, number> = { Low: 0, Medium: 1, High: 2 };
const QUADRANT_LABEL: Record<string, string> = { strategic: "Strategic", leverage: "Leverage", bottleneck: "Bottleneck", non_critical: "Non-critical" };
const X_MIN = 10_000;
const X_MAX = 50_000_000;

/** Deterministic vertical jitter so suppliers with the same sourcing level do not overlap. */
function jitter(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.5;
}

interface Point {
  id: string;
  name: string;
  x: number;
  y: number;
  level: string;
  quadrant: string;
  pinned: boolean;
}

/**
 * Portfolio view: spend (po_volume_eur, log scale) against supply risk (sourcing_risk_level) for the given suppliers,
 * quadrants from kraljic_position (spend threshold p75). Pinned suppliers are the filled, larger points.
 */
export function KraljicMatrix({ ids, names, pinned, onOpen }: { ids: string[]; names: Record<string, string>; pinned: Set<string>; onOpen?: (id: string) => void }) {
  const sorted = [...ids].sort();
  const { data, error } = useDataTool<KraljicResult>("kraljic_position", sorted.length ? { ids: sorted } : null);
  const threshold = num(data?.thresholds?.po_volume_eur_high);
  const highLevels = Array.isArray(data?.thresholds?.supply_risk_high_levels) ? (data!.thresholds!.supply_risk_high_levels as string[]) : ["High"];
  // boundary between low and high supply risk on the y axis
  const yCut = highLevels.includes("Medium") ? 0.5 : 1.5;

  const points: Point[] = (data?.suppliers ?? [])
    .map((s) => {
      const x = num(s.po_volume_eur);
      const level = typeof s.sourcing_risk_level === "string" ? s.sourcing_risk_level : "";
      if (x === null || !(level in RISK_Y)) return null;
      return {
        id: s.supplier_id,
        name: names[s.supplier_id] ?? (s as { supplier_name?: string }).supplier_name ?? s.supplier_id,
        x: Math.min(Math.max(x, X_MIN), X_MAX),
        y: RISK_Y[level] + jitter(s.supplier_id),
        level,
        quadrant: s.quadrant ?? "",
        pinned: pinned.has(s.supplier_id),
      };
    })
    .filter((p): p is Point => !!p);

  const labelStyle = { fill: CHART.textMuted, fontSize: 12, fontWeight: 500 };
  const tick = { fontSize: 12, fill: CHART.textMuted };

  return (
    <div data-kraljic className="flex flex-col gap-2">
      <ErrorNote error={error} what="kraljic_position" />
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" />
            {threshold !== null && (
              <>
                <ReferenceArea x1={threshold} x2={X_MAX} y1={yCut} y2={2.5} fill="transparent" label={{ value: QUADRANT_LABEL.strategic, position: "insideTopRight", ...labelStyle }} />
                <ReferenceArea x1={X_MIN} x2={threshold} y1={yCut} y2={2.5} fill="transparent" label={{ value: QUADRANT_LABEL.bottleneck, position: "insideTopLeft", ...labelStyle }} />
                <ReferenceArea x1={threshold} x2={X_MAX} y1={-0.5} y2={yCut} fill="transparent" label={{ value: QUADRANT_LABEL.leverage, position: "insideBottomRight", ...labelStyle }} />
                <ReferenceArea x1={X_MIN} x2={threshold} y1={-0.5} y2={yCut} fill="transparent" label={{ value: QUADRANT_LABEL.non_critical, position: "insideBottomLeft", ...labelStyle }} />
                <ReferenceLine x={threshold} stroke={CHART.axis} strokeDasharray="4 3" />
              </>
            )}
            <ReferenceLine y={yCut} stroke={CHART.axis} strokeDasharray="4 3" />
            <XAxis
              type="number"
              dataKey="x"
              scale="log"
              domain={[X_MIN, X_MAX]}
              ticks={[1e4, 1e5, 1e6, 1e7]}
              tickFormatter={(v: number) => fmtEur(v)}
              stroke={CHART.axis}
              tick={{ ...tick, fontFamily: "var(--lw-font-mono)" }}
              allowDataOverflow
            />
            <YAxis
              type="number"
              dataKey="y"
              domain={[-0.5, 2.5]}
              ticks={[0, 1, 2]}
              tickFormatter={(v: number) => ["Low", "Medium", "High"][v] ?? ""}
              stroke={CHART.axis}
              tick={tick}
              width={60}
            />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const p = active && payload?.[0]?.payload ? (payload[0].payload as Point) : null;
                if (!p) return null;
                return (
                  <div className="rounded-lg border border-subtle bg-surface px-3 py-2 text-sm shadow-md">
                    <div className="font-medium text-ink">{p.name}</div>
                    <div className="text-subtext">
                      <span className="font-mono">{fmtEur(p.x)}</span> · {QUADRANT_LABEL[p.quadrant] ?? p.quadrant}
                      {p.pinned ? " · pinned" : ""}
                    </div>
                  </div>
                );
              }}
            />
            <Scatter
              data={points}
              isAnimationActive={false}
              shape={(props: unknown) => {
                const { cx: x, cy: y, payload } = props as { cx?: number; cy?: number; payload: Point };
                if (x === undefined || y === undefined) return <g />;
                return (
                  <circle
                    cx={x}
                    cy={y}
                    r={payload.pinned ? 6 : 4}
                    fill={payload.pinned ? CHART.pointHighlight : CHART.point}
                    fillOpacity={payload.pinned ? 1 : 0.6}
                    stroke={CHART.surface}
                    strokeWidth={2}
                    style={onOpen ? { cursor: "pointer" } : undefined}
                    onClick={onOpen ? () => onOpen(payload.id) : undefined}
                  />
                );
              }}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="text-sm text-subtext">PO volume against sourcing risk for the suppliers listed above; pinned ones are filled.</p>
    </div>
  );
}
