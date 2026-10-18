"use client";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fieldLabel, fmtNum, num, type ExplainResult, type Metadata } from "./domain";
import { CHART } from "./chart-theme";

interface Step {
  name: string;
  base: number;
  value: number;
  delta: number;
  kind: "start" | "up" | "down" | "end";
  detail: string;
  label: string;
}

const TOP = 8;

/**
 * Waterfall from the dataset mean to this supplier's score. Each bar is one field's
 * weight x (value - dataset mean): risk color where it raises risk, low-risk color where it lowers it.
 */
export function ContributionWaterfall({ meta, explain, endLabel }: { meta: Metadata; explain: ExplainResult & { profile_score?: number }; endLabel: string }) {
  const contribs = (explain.contributions ?? []).filter((c) => typeof c.contribution_vs_mean === "number");
  const mean = num(explain.dataset_mean);
  if (!contribs.length || mean === null) return <p className="text-sm text-subtext">No contribution breakdown in this response.</p>;

  const sorted = [...contribs].sort((a, b) => Math.abs(b.contribution_vs_mean!) - Math.abs(a.contribution_vs_mean!));
  const top = sorted.slice(0, TOP).sort((a, b) => b.contribution_vs_mean! - a.contribution_vs_mean!);
  const rest = sorted.slice(TOP);
  const restSum = rest.reduce((s, c) => s + c.contribution_vs_mean!, 0);
  const sumAll = contribs.reduce((s, c) => s + c.contribution_vs_mean!, 0);
  // contributions sum to (score - dataset-mean score); for the default profile that mean is the TRI mean
  const end = mean + sumAll;
  const reported = num(explain.profile_score) ?? num(explain.total_risk_index);

  const steps: Step[] = [];
  let run = mean;
  const points: number[] = [mean];
  const push = (name: string, delta: number, detail: string) => {
    const base = delta >= 0 ? run : run + delta;
    steps.push({ name, base, value: Math.abs(delta), delta, kind: delta >= 0 ? "up" : "down", detail, label: `${delta >= 0 ? "+" : "−"}${fmtNum(Math.abs(delta), 1)}` });
    run += delta;
    points.push(run);
  };
  for (const c of top) push(fieldLabel(meta, c.field), c.contribution_vs_mean!, `value ${fmtNum(num(c.value), 1)} · weight ${fmtNum(num(c.weight), 2)} · percentile ${fmtNum(num(c.percentile), 0)}`);
  if (rest.length) push(`${rest.length} other fields`, restSum, rest.map((c) => fieldLabel(meta, c.field)).join(", "));
  points.push(end);
  const lo = Math.max(0, Math.floor(Math.min(...points) - 4));
  const hi = Math.min(100, Math.ceil(Math.max(...points) + 4));
  const data: Step[] = [
    { name: "Dataset mean", base: lo, value: mean - lo, delta: mean, kind: "start", detail: "mean over all suppliers", label: fmtNum(mean, 1) },
    ...steps,
    { name: endLabel, base: lo, value: end - lo, delta: end, kind: "end", detail: reported !== null ? `reported ${fmtNum(reported, 2)}` : "", label: fmtNum(end, 1) },
  ];
  const fill = (s: Step) => (s.kind === "up" ? CHART.increase : s.kind === "down" ? CHART.decrease : CHART.neutral);

  return (
    <div style={{ height: 28 + data.length * 24 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barCategoryGap={4}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} strokeDasharray="2 4" />
          <XAxis type="number" domain={[lo, hi]} allowDataOverflow tick={{ fontSize: 10, fill: CHART.textMuted, fontFamily: "var(--lw-font-mono)" }} stroke={CHART.axis} />
          <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 11, fill: CHART.text }} stroke={CHART.axis} interval={0} />
          <ReferenceLine x={mean} stroke={CHART.axis} strokeDasharray="3 3" />
          <Tooltip
            cursor={{ fill: CHART.grid, fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const s = active && payload?.[0]?.payload ? (payload[0].payload as Step) : null;
              if (!s) return null;
              return (
                <div className="max-w-64 rounded-lg border border-subtle bg-surface px-2.5 py-1.5 text-xs shadow-md">
                  <div className="font-medium text-ink">{s.name}</div>
                  <div className="font-mono tabular-nums text-ink">
                    {s.kind === "start" || s.kind === "end" ? fmtNum(s.delta, 2) : `${s.delta >= 0 ? "+" : "−"}${fmtNum(Math.abs(s.delta), 2)} points`}
                  </div>
                  {s.detail && <div className="text-subtext">{s.detail}</div>}
                </div>
              );
            }}
          />
          <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="value" stackId="w" isAnimationActive={false} radius={2}>
            {data.map((s, i) => (
              <Cell key={i} fill={fill(s)} />
            ))}
            <LabelList dataKey="label" position="right" style={{ fontSize: 10, fill: CHART.textMuted, fontFamily: "var(--lw-font-mono)" }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
