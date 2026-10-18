export { cn } from "@/design-system/react/utils/cn";

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

/** Level band for a 0-100 risk score (0 = no risk). */
export function levelOf(score: number): RiskLevel {
  if (score >= 75) return "Critical";
  if (score >= 50) return "High";
  if (score >= 25) return "Medium";
  return "Low";
}

/** CSS color variables for a level; use for chips, bars and heatmap cells. */
export function levelColors(level: RiskLevel) {
  const k = level.toLowerCase();
  return { fg: `var(--risk-${k})`, bg: `var(--risk-${k}-soft)` };
}

export const formatEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
