import type { Level } from "./domain";

/**
 * Chart colors as design-system CSS variables (recharts passes them to SVG, so light/dark follow
 * data-theme without JS). Identity uses graphite shades plus dash patterns; strong color is
 * reserved for risk: levels, and contributions that raise (critical) or lower (low) risk.
 */
export const CHART = {
  surface: "var(--lw-surface)",
  grid: "var(--lw-border)",
  axis: "var(--lw-text-tertiary)",
  text: "var(--lw-text-primary)",
  textMuted: "var(--lw-text-secondary)",
  /** up to three suppliers on one chart: stroke + dash pattern */
  series: [
    { stroke: "var(--lw-text-primary)", dash: undefined as string | undefined },
    { stroke: "var(--lw-text-secondary)", dash: "6 3" },
    { stroke: "var(--lw-text-tertiary)", dash: "2 3" },
  ],
  reference: "var(--lw-gray-400)",
  point: "var(--lw-text-tertiary)",
  pointHighlight: "var(--lw-text-primary)",
  increase: "var(--risk-critical)",
  decrease: "var(--risk-low)",
  neutral: "var(--lw-gray-300)",
};

export const LEVEL_VAR: Record<Level, { fg: string; bg: string }> = {
  Low: { fg: "var(--risk-low)", bg: "var(--risk-low-soft)" },
  Medium: { fg: "var(--risk-medium)", bg: "var(--risk-medium-soft)" },
  High: { fg: "var(--risk-high)", bg: "var(--risk-high-soft)" },
  Critical: { fg: "var(--risk-critical)", bg: "var(--risk-critical-soft)" },
};
