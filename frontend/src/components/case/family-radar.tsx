"use client";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { familyLabel, fmtNum, type Metadata } from "./domain";
import { CHART } from "./chart-theme";

export interface RadarSeries {
  id: string;
  name: string;
  scores: Record<string, number | string | null | undefined>;
  /** neutral reference series (dataset mean), drawn dotted */
  reference?: boolean;
}

/**
 * Family scores (0 = no risk, 100 = max) as a radar. At most three suppliers, told apart by
 * graphite shade and dash pattern (the legend always names them), plus one dotted reference.
 */
export function FamilyRadar({ meta, families, series, height = 220 }: { meta: Metadata; families: string[]; series: RadarSeries[]; height?: number }) {
  const colored = series.filter((s) => !s.reference).slice(0, 3);
  const refs = series.filter((s) => s.reference).slice(0, 1);
  const shown = [...refs, ...colored];
  const data = families.map((f) => {
    const row: Record<string, string | number | null> = { family: familyLabel(f, meta) };
    for (const s of shown) row[s.id] = typeof s.scores[f] === "number" ? (s.scores[f] as number) : null;
    return row;
  });
  const styleOf = (s: RadarSeries) => (s.reference ? { stroke: CHART.reference, dash: "1 3" } : CHART.series[colored.indexOf(s)] ?? CHART.series[0]);

  if (!families.length || !shown.length) return null;
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="70%" margin={{ top: 4, right: 28, bottom: 4, left: 28 }}>
            <PolarGrid stroke={CHART.grid} />
            <PolarAngleAxis dataKey="family" tick={{ fontSize: 10, fill: CHART.textMuted }} />
            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 9, fill: CHART.axis }} axisLine={false} angle={90} />
            {shown.map((s) => {
              const st = styleOf(s);
              return (
                <Radar
                  key={s.id}
                  name={s.name}
                  dataKey={s.id}
                  stroke={st.stroke}
                  strokeWidth={s.reference ? 1.5 : 2}
                  strokeDasharray={st.dash}
                  fill={st.stroke}
                  fillOpacity={s.reference || colored.length > 1 ? 0 : 0.08}
                  dot={{ r: 2.5, fill: st.stroke, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              );
            })}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-xs shadow-md">
                    <div className="mb-0.5 font-medium text-ink">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center gap-2">
                        <span className="text-subtext">{p.name}</span>
                        <span className="ml-auto font-mono tabular-nums text-ink">{fmtNum(typeof p.value === "number" ? p.value : null, 1)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-1 flex flex-wrap justify-center gap-x-4 gap-y-1 text-2xs text-subtext">
        {shown.map((s) => {
          const st = styleOf(s);
          return (
            <li key={s.id} className="flex items-center gap-1.5">
              <svg width="18" height="6" aria-hidden>
                <line x1="0" y1="3" x2="18" y2="3" stroke={st.stroke} strokeWidth="2" strokeDasharray={st.dash} />
              </svg>
              {s.name}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
