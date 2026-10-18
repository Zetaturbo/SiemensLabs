import type { Owner, SourcingCase, Stage } from "@/lib/cases/types";
import { PARTS, type TrainPart } from "./config";
import { mix, type BlueprintPalette } from "./palette";

export type RiskLevel = NonNullable<SourcingCase["riskSummary"]["level"]>;

export const STAGES: Stage[] = ["none", "long_list", "shortlist", "finalists", "awarded"];

export const STAGE_LABEL: Record<Stage, string> = {
  none: "Not started",
  long_list: "Long list",
  shortlist: "Shortlist",
  finalists: "Finalists",
  awarded: "Awarded",
};

/** Stage wording for one part: a part without any case reads "No case", a case not yet started "Not started". */
export function stageText(v: Pick<PartView, "stage" | "case">): string {
  return v.stage === "none" && !v.case ? "No case" : STAGE_LABEL[v.stage];
}

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

/** Target appearance of one part in the canvas; the scene eases towards it (blueprint.tsx). */
export interface PartVisual {
  /** Edge colour. */
  color: string;
  /** Fill colour (the sheet tint, or tinted with the stage colour when selected). */
  fillColor: string;
  lineOpacity: number;
  /** Lines behind other geometry (the x-ray pass). */
  hiddenOpacity: number;
  fillOpacity: number;
  /** CSS pixels. */
  lineWidth: number;
  /** Opacity of seams between faces that both face the camera, relative to silhouettes. */
  interior: number;
  /** 0 to 1: soft glow on the selected part (bloom in the dark theme). */
  glow: number;
}

/** Structural geometry that is not a part (rails, sleepers, unassigned GLB meshes). */
export function baseVisual(p: BlueprintPalette): PartVisual {
  return { color: p.line, fillColor: p.fill, lineOpacity: 0.36, hiddenOpacity: 0.045, fillOpacity: p.fillAlpha * 0.5, lineWidth: 1, interior: 0.5, glow: 0 };
}

export function partVisual(p: BlueprintPalette, view: PartView | undefined, hovered: boolean, selected: boolean, dimmed: boolean): PartVisual {
  if (!view) return baseVisual(p);
  if (!view.matches) {
    return { color: p.lineDim, fillColor: p.fill, lineOpacity: p.lineDimAlpha * 0.5, hiddenOpacity: 0.02, fillOpacity: p.fillAlpha * 0.15, lineWidth: 1, interior: 0.5, glow: 0 };
  }
  const stage = p.stage[view.stage];
  if (selected) {
    // the grey of "not started" would barely read as a highlight, so it is drawn in the sheet's ink
    const ink = view.stage === "none" ? p.text : stage;
    return { color: ink, fillColor: mix(p.fill, ink, 0.4), lineOpacity: 1, hiddenOpacity: 0.42, fillOpacity: p.fillAlpha * 2.6, lineWidth: 1.8, interior: 0.8, glow: 1 };
  }
  if (hovered) {
    return { color: mix(stage, p.text, 0.25), fillColor: p.fill, lineOpacity: 1, hiddenOpacity: 0.36, fillOpacity: p.fillAlpha * 2, lineWidth: 1.6, interior: 0.75, glow: 0 };
  }
  return {
    color: stage,
    fillColor: p.fill,
    lineOpacity: dimmed ? 0.42 : 0.82,
    hiddenOpacity: dimmed ? 0.035 : 0.11,
    fillOpacity: p.fillAlpha * (dimmed ? 0.5 : 0.8),
    lineWidth: 1.15,
    interior: 0.55,
    glow: 0,
  };
}
