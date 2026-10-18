"use client";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { familyLabel, fmtNum, type Metadata } from "./domain";
import { useChartTheme } from "./chart-theme";
import { cx, ui } from "./primitives";

export interface RadarSeries {
  id: string;
  name: string;
  scores: Record<string, number | null | undefined>;
  /** neutral reference series (dataset mean), drawn dashed in gray */
  reference?: boolean;
}

/**
 * Family scores (0 = no risk, 100 = max) as a radar. At most three colored series (the validated
 * all-pairs limit of the palette) plus one neutral reference; a legend always names them.
 */
export function FamilyRadar({ meta, families, series, height = 220 }: { meta: Metadata; families: string[]; series: RadarSeries[]; height?: number }) {
  const theme = useChartTheme();
  const colored = series.filter((s) => !s.reference).slice(0, 3);
  const refs = series.filter((s) => s.reference).slice(0, 1);
  const shown = [...refs, ...colored];
  const data = families.map((f) => {
    const row: Record<string, string | number | null> = { family: familyLabel(f, meta) };
    for (const s of shown) row[s.id] = typeof s.scores[f] === "number" ? (s.scores[f] as number) : null;
    return row;
  });
  const colorOf = (s: RadarSeries) => (s.reference ? theme.neutral : theme.series[colored.indexOf(s)] ?? theme.neutral);

  if (!families.length || !shown.length) return null;
  return (
    <div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadarChart data={data} outerRadius="72%" margin={{ top: 4, right: 24, bottom: 4, left: 24 }}>
            <PolarGrid stroke={theme.grid} />
            <PolarAngleAxis dataKey="family" tick={{ fontSize: 10, fill: theme.textMuted }} />
            <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 9, fill: theme.textMuted }} axisLine={false} angle={90} />
            {shown.map((s) => (
              <Radar
                key={s.id}
                name={s.name}
                dataKey={s.id}
                stroke={colorOf(s)}
                strokeWidth={2}
                strokeDasharray={s.reference ? "4 3" : undefined}
                fill={colorOf(s)}
                fillOpacity={s.reference ? 0 : 0.12}
                dot={{ r: 2.5, fill: colorOf(s), strokeWidth: 0 }}
                isAnimationActive={false}
              />
            ))}
            <Tooltip
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <div className="rounded-md border border-zinc-200 bg-white px-2 py-1.5 text-[11px] shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
                    <div className="mb-0.5 font-medium">{label}</div>
                    {payload.map((p) => (
                      <div key={String(p.dataKey)} className="flex items-center gap-1.5">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ background: p.color }} />
                        <span className={ui.muted}>{p.name}</span>
                        <span className="ml-auto tabular-nums">{fmtNum(typeof p.value === "number" ? p.value : null, 1)}</span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <ul className={cx("mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]", ui.muted)}>
        {shown.map((s) => (
          <li key={s.id} className="flex items-center gap-1">
            <span className={cx("inline-block h-0.5 w-3", s.reference && "border-t border-dashed")} style={s.reference ? { borderColor: colorOf(s) } : { background: colorOf(s) }} />
            {s.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
