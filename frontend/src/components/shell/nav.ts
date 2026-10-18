import { Building2, ChartColumn, FolderKanban, Settings, Telescope, TrainFront, Users, type LucideIcon } from "lucide-react";
import trainParts from "@/config/train-parts.json";
import type { Stage } from "@/lib/cases/types";

export interface Section {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Product sections in sidebar order. */
export const SECTIONS: Section[] = [
  { href: "/train", label: "Train map", icon: TrainFront },
  { href: "/cases", label: "Cases", icon: FolderKanban },
  { href: "/suppliers", label: "Suppliers", icon: Building2 },
  { href: "/research", label: "Research", icon: Telescope },
  { href: "/reports", label: "Reports", icon: ChartColumn },
  { href: "/team", label: "Team", icon: Users },
];

export const SETTINGS: Section = { href: "/settings", label: "Settings", icon: Settings };

interface PartRow {
  id: string;
  label: string;
  profile: string;
}
export const PARTS: PartRow[] = (trainParts as { parts: PartRow[] }).parts;

export const partLabel = (partId: string) => PARTS.find((p) => p.id === partId)?.label ?? partId.replace(/_/g, " ");
export const caseLabel = (caseId: string) => partLabel(caseId.replace(/^case_/, ""));

export const STAGE_LABEL: Record<Stage, string> = {
  none: "Not started",
  long_list: "Long list",
  shortlist: "Shortlist",
  finalists: "Finalists",
  awarded: "Awarded",
};

/** Stage dot tone: color only for the end state, graphite while in progress, gray before. */
export const STAGE_TONE: Record<Stage, "neutral" | "brand" | "success"> = {
  none: "neutral",
  long_list: "brand",
  shortlist: "brand",
  finalists: "brand",
  awarded: "success",
};

/** The section a pathname belongs to (longest prefix), or null. */
export function sectionFor(pathname: string | null): Section | null {
  if (!pathname) return null;
  const all = [...SECTIONS, SETTINGS];
  return all.find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`)) ?? null;
}

/** Case id when the pathname is a case screen. */
export function caseIdFor(pathname: string | null): string | null {
  const m = pathname ? /^\/cases\/([^/]+)/.exec(pathname) : null;
  return m ? decodeURIComponent(m[1]) : null;
}

/** "3 min ago", "2 h ago", "4 Oct" for list timestamps. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "–";
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}
