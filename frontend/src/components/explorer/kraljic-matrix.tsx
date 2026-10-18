"use client";
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/design-system/react";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { fmtEur, num, type KraljicResult } from "@/components/case/domain";
import { CHART } from "@/components/case/chart-theme";
import { ErrorNote, Spinner } from "@/components/case/primitives";

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

/** Spend (po_volume_eur, log) against supply risk (sourcing_risk_level), quadrants from kraljic_position. */
export function KraljicMatrix({ ids, names, pinned, onOpen }: { ids: string[]; names: Record<string, string>; pinned: Set<string>; onOpen: (id: string) => void }) {
  const sorted = [...ids].sort();
  const { data, error, loading } = useDataTool<KraljicResult & { quadrant_counts?: Record<string, number> }>("kraljic_position", sorted.length ? { ids: sorted } : null);
  const threshold = num(data?.thresholds?.po_volume_eur_high);
  const highLevels = Array.isArray(data?.thresholds?.supply_risk_high_levels) ? (data!.thresholds!.supply_risk_high_levels as string[]) : ["High"];
  // boundary between low and high supply risk on the y axis
  const yCut = highLevels.includes("Medium") ? 0.5 : 1.5;
  const counts = data?.quadrant_counts ?? {};

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

  const label = (q: string) => `${QUADRANT_LABEL[q]}${counts[q] !== undefined ? ` · ${counts[q].toLocaleString("en-US")} in dataset` : ""}`;
  const labelStyle = { fill: CHART.textMuted, fontSize: 10, fontWeight: 600 };

  return (
    <Card>
      <CardHeader
        title="Kraljic matrix"
        description={`PO volume (x, log scale) against sourcing risk (y) for the visible rows. Spend threshold ${threshold !== null ? fmtEur(threshold) : "–"} (p75); high supply risk = sourcing risk ${highLevels.join(" or ")}.`}
        action={loading ? <Spinner /> : undefined}
      />
      <div className="px-4 pb-4">
        <ErrorNote error={error} what="kraljic_position" />
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 8, right: 12, bottom: 18, left: 4 }}>
              <CartesianGrid stroke={CHART.grid} strokeDasharray="2 4" />
              {threshold !== null && (
                <>
                  <ReferenceArea x1={threshold} x2={X_MAX} y1={yCut} y2={2.5} fill="transparent" label={{ value: label("strategic"), position: "insideTopRight", ...labelStyle }} />
                  <ReferenceArea x1={X_MIN} x2={threshold} y1={yCut} y2={2.5} fill="transparent" label={{ value: label("bottleneck"), position: "insideTopLeft", ...labelStyle }} />
                  <ReferenceArea x1={threshold} x2={X_MAX} y1={-0.5} y2={yCut} fill="transparent" label={{ value: label("leverage"), position: "insideBottomRight", ...labelStyle }} />
                  <ReferenceArea x1={X_MIN} x2={threshold} y1={-0.5} y2={yCut} fill="transparent" label={{ value: label("non_critical"), position: "insideBottomLeft", ...labelStyle }} />
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
                tick={{ fontSize: 10, fill: CHART.textMuted, fontFamily: "var(--lw-font-mono)" }}
                allowDataOverflow
                label={{ value: "PO volume (log scale)", position: "insideBottom", offset: -10, fontSize: 10, fill: CHART.textMuted }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[-0.5, 2.5]}
                ticks={[0, 1, 2]}
                tickFormatter={(v: number) => ["Low", "Medium", "High"][v] ?? ""}
                stroke={CHART.axis}
                tick={{ fontSize: 10, fill: CHART.textMuted }}
                width={56}
              />
              <Tooltip
                cursor={false}
                content={({ active, payload }) => {
                  const p = active && payload?.[0]?.payload ? (payload[0].payload as Point) : null;
                  if (!p) return null;
                  return (
                    <div className="rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-xs shadow-md">
                      <div className="font-medium text-ink">{p.name}</div>
                      <div className="text-subtext">
                        <span className="font-mono">{fmtEur(p.x)}</span> · sourcing risk {p.level} · {QUADRANT_LABEL[p.quadrant] ?? p.quadrant}
                        {p.pinned ? " · shortlisted" : ""}
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
                      r={payload.pinned ? 6 : 4.5}
                      fill={payload.pinned ? CHART.pointHighlight : CHART.point}
                      fillOpacity={payload.pinned ? 1 : 0.7}
                      stroke={CHART.surface}
                      strokeWidth={2}
                      style={{ cursor: "pointer" }}
                      onClick={() => onOpen(payload.id)}
                    />
                  );
                }}
              />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-1 flex items-center gap-4 text-2xs text-subtext">
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: CHART.point }} /> supplier in view
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-full" style={{ background: CHART.pointHighlight }} /> shortlisted
          </span>
        </div>
      </div>
    </Card>
  );
}
