import type { Owner, SourcingCase, Stage } from "@/lib/cases/types";
import { PARTS, type TrainPart } from "./config";
import { mix, type BlueprintPalette } from "./palette";

export type RiskLevel = NonNullable<SourcingCase["riskSummary"]["level"]>;

export const STAGES: Stage[] = ["none", "long_list", "shortlist", "finalists", "awarded"];

export const STAGE_LABEL: Record<Stage, string> = {
  none: "No case",
  long_list: "Long list",
  shortlist: "Shortlist",
  finalists: "Finalists",
  awarded: "Awarded",
};

export const RISK_LEVELS: RiskLevel[] = ["Critical", "High", "Medium", "Low"];

/** Risk colours for DOM elements (globals.css). */
export const RISK_CSS: Record<RiskLevel, { fg: string; bg: string }> = {
  Low: { fg: "var(--risk-low)", bg: "var(--risk-low-soft)" },
  Medium: { fg: "var(--risk-medium)", bg: "var(--risk-medium-soft)" },
  High: { fg: "var(--risk-high)", bg: "var(--risk-high-soft)" },
  Critical: { fg: "var(--risk-critical)", bg: "var(--risk-critical-soft)" },
};

export const ME: Owner = { name: "You", department: "Procurement" };

export interface Filters {
  owner: string; // "all" | "mine" | "unassigned" | `dept:${department}`
  stage: Stage | "all";
  risk: RiskLevel | "unrated" | "all";
  profile: string; // "all" | profile id
}

export const DEFAULT_FILTERS: Filters = { owner: "all", stage: "all", risk: "all", profile: "all" };

export interface PartView {
  part: TrainPart;
  case: SourcingCase | undefined;
  stage: Stage;
  owner: Owner | null;
  profileId: string;
  risk: RiskLevel | null;
  flagCount: number;
  matches: boolean;
  /** Safety-relevant part without a case: pulses until someone picks it up. */
  needsCase: boolean;
}

export function caseForPart(cases: Record<string, SourcingCase>, partId: string): SourcingCase | undefined {
  let best: SourcingCase | undefined;
  for (const c of Object.values(cases)) {
    if (c.partId !== partId) continue;
    if (!best || c.updatedAt > best.updatedAt) best = c;
  }
  return best;
}

export function matchesFilters(v: Omit<PartView, "matches">, f: Filters): boolean {
  if (f.owner === "mine" && v.owner?.name !== ME.name) return false;
  if (f.owner === "unassigned" && v.owner) return false;
  if (f.owner.startsWith("dept:") && v.owner?.department !== f.owner.slice(5)) return false;
  if (f.stage !== "all" && v.stage !== f.stage) return false;
  if (f.risk === "unrated" && v.risk) return false;
  if (f.risk !== "all" && f.risk !== "unrated" && v.risk !== f.risk) return false;
  if (f.profile !== "all" && v.profileId !== f.profile) return false;
  return true;
}

export function computeViews(cases: Record<string, SourcingCase>, filters: Filters): PartView[] {
  return PARTS.map((part) => {
    const c = caseForPart(cases, part.id);
    const base = {
      part,
      case: c,
      stage: c?.stage ?? "none",
      owner: c?.owner ?? null,
      profileId: c?.profileId && c.profileId !== "default" ? c.profileId : part.profile,
      risk: c?.riskSummary.level ?? null,
      flagCount: c?.riskSummary.flagCount ?? 0,
      needsCase: part.criticality === "safety" && !c,
    } satisfies Omit<PartView, "matches">;
    return { ...base, matches: matchesFilters(base, filters) };
  });
}

export function isFiltered(f: Filters): boolean {
  return f.owner !== "all" || f.stage !== "all" || f.risk !== "all" || f.profile !== "all";
}

export interface PartVisual {
  color: string;
  lineOpacity: number;
  hiddenOpacity: number;
  fillOpacity: number;
  lineWidth: number;
  dashed: boolean;
  pulse: boolean;
}

/** Structural geometry that is not a part (rails, sleepers, unassigned GLB meshes). */
export function baseVisual(p: BlueprintPalette): PartVisual {
  return { color: p.line, lineOpacity: 0.42, hiddenOpacity: 0.07, fillOpacity: p.fillAlpha * 0.4, lineWidth: 1, dashed: false, pulse: false };
}

export function partVisual(p: BlueprintPalette, view: PartView | undefined, hovered: boolean, selected: boolean, dimmed: boolean): PartVisual {
  if (!view) return baseVisual(p);
  if (!view.matches) {
    return { color: p.lineDim, lineOpacity: p.lineDimAlpha * 0.4, hiddenOpacity: 0.025, fillOpacity: p.fillAlpha * 0.15, lineWidth: 1, dashed: false, pulse: false };
  }
  const color = p.stage[view.stage];
  const hot = hovered || selected;
  return {
    color: hot ? mix(color, p.text, 0.35) : color,
    lineOpacity: hot ? 1 : dimmed ? 0.5 : 0.85,
    hiddenOpacity: hot ? 0.5 : dimmed ? 0.06 : 0.14,
    fillOpacity: p.fillAlpha * (selected ? 2.6 : hovered ? 2 : 0.8),
    lineWidth: selected ? 2.2 : hovered ? 1.8 : 1.25,
    dashed: selected,
    pulse: view.needsCase && !hot,
  };
}
