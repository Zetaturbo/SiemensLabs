import { z } from "zod/v4";
import trainParts from "@/config/train-parts.json";
import { FALLBACK_KNOCKOUTS } from "@/components/case/domain";
import type { FilterCondition } from "@/lib/data-api/types";
import { defineSkill } from "./types";
import { conditionText, dataOrThrow } from "./shared";

interface TrainPart {
  id: string;
  label: string;
  group: string;
  profile: string;
  criticality: string;
}

const PARTS = (trainParts as { parts: TrainPart[] }).parts;

interface Profile {
  profile_id: string;
  label?: string;
  description?: string;
  weights?: Record<string, number>;
  knock_outs?: unknown;
}

interface MetaField {
  field: string;
  label?: string;
  description?: string;
  family?: string | null;
}

export interface Guidance {
  query: string;
  part: { id: string; label: string; group: string; criticality: string } | null;
  matched_by: "part" | "keyword" | "default";
  profile_id: string;
  profile_label: string;
  dimensions: Array<{ field: string; label: string; description: string; family: string | null; weight: number }>;
  filters: FilterCondition[];
  why: string;
  handle: string;
}

const STOP = new Set(["and", "the", "for", "with", "filters", "matter", "matters", "look", "should", "criteria", "part", "parts", "system", "systems", "unit", "units", "train", "procuring", "procurement", "sourcing", "buying", "when", "what", "which"]);

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !STOP.has(w));

/** "brakes" ~ "brake", "seating" ~ "seats": shared stem of at least 4 letters. */
const stemMatch = (a: string, b: string) => {
  const n = Math.min(a.length, b.length, 5);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
};

/** Fallbacks by criticality when the text names no train-map part. Order matters: safety wins. */
const KEYWORDS: Array<{ profile: string; reason: string; words: string[] }> = [
  { profile: "safety_critical", reason: "safety", words: ["brake", "bogie", "wheel", "axle", "door", "coupler", "gangway", "signal", "suspension", "damper", "crash", "fire"] },
  { profile: "strategic_system", reason: "electronics", words: ["control", "software", "electronic", "electronics", "tcms", "hmi", "display", "sensor", "converter", "inverter", "cyber", "network", "computer", "firmware", "traction", "motor"] },
  { profile: "lksg_due_diligence", reason: "labor", words: ["textile", "upholstery", "fabric", "harness", "wiring", "battery", "cobalt", "lithium", "mining", "raw", "casting", "assembly", "labor", "labour", "seat"] },
  { profile: "commodity", reason: "consumable", words: ["fastener", "bolt", "screw", "nut", "cable", "filter", "gasket", "seal", "lubricant", "paint", "consumable", "lamp", "lighting", "spare", "standard", "hvac"] },
];

function matchPart(query: string): { part: TrainPart | null; profile: string; matched_by: Guidance["matched_by"] } {
  const q = query.trim().toLowerCase();
  const exact = PARTS.find((p) => p.id === q || p.id === q.replace(/[\s-]+/g, "_") || p.label.toLowerCase() === q);
  if (exact) return { part: exact, profile: exact.profile, matched_by: "part" };
  const qw = words(query);
  let best: { part: TrainPart; score: number } | null = null;
  for (const p of PARTS) {
    const pw = [...words(p.label), ...words(p.id.replace(/_/g, " "))];
    const score = qw.filter((w) => pw.some((x) => stemMatch(w, x))).length;
    if (score > 0 && (!best || score > best.score)) best = { part: p, score };
  }
  if (best) return { part: best.part, profile: best.part.profile, matched_by: "part" };
  for (const k of KEYWORDS) if (qw.some((w) => k.words.some((x) => stemMatch(w, x)))) return { part: null, profile: k.profile, matched_by: "keyword" };
  return { part: null, profile: "default", matched_by: "default" };
}

const CHARACTER: Record<string, string> = {
  safety_critical: "safety-critical",
  strategic_system: "a strategic system",
  commodity: "a commodity part",
  lksg_due_diligence: "an LkSG due-diligence category",
  default: "a general part",
};

function knockOuts(p: Profile | undefined, profileId: string): FilterCondition[] {
  const own = Array.isArray(p?.knock_outs)
    ? (p.knock_outs as FilterCondition[]).filter((c) => c && typeof c.field === "string" && typeof c.op === "string" && c.value !== undefined)
    : null;
  return own?.length ? own : (FALLBACK_KNOCKOUTS[profileId] ?? []);
}

const pct = (w: number) => `${Math.round(w * 100)} %`;
const short = (label: string) => label.replace(/ (Risk|Score|Rating)$/i, "").toLowerCase();

export const whatMatters = defineSkill({
  name: "what_matters",
  description:
    "Guidance on what matters when sourcing a train part: maps the part to its weight profile and returns the most heavily weighted risk dimensions " +
    "with descriptions, the recommended knock-out filters and why. Use when the buyer asks which filters, criteria, risks or dimensions matter, " +
    "what to look for, or how to start sourcing a part. Do not use to find or list suppliers (filter_suppliers) or to rank them (rank_with_profile). " +
    "Renders a Guidance block with an Apply button that sets the filters.",
  priority: "core",
  stage: "any",
  input: z.object({
    part: z
      .string()
      .optional()
      .describe("Train-map part id (brake_system) or the part as the buyer named it ('brake pads', 'HVAC units'). Omit for the current case's part."),
  }),
  run: async (input, ctx): Promise<Guidance> => {
    const query = input.part?.trim() || ctx.workflow.part_id || ctx.workflow.buyer_inputs.category || "";
    const m = matchPart(query);
    const [profilesData, metaData] = await Promise.all([
      dataOrThrow<{ profiles: Profile[] }>("list_profiles", {}),
      dataOrThrow<{ fields: MetaField[] }>("get_metadata", {}),
    ]);
    const profile = profilesData.profiles.find((p) => p.profile_id === m.profile);
    const meta = new Map(metaData.fields.map((f) => [f.field, f]));
    const dimensions = Object.entries(profile?.weights ?? {})
      .filter(([, w]) => typeof w === "number" && w > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([field, weight]) => {
        const f = meta.get(field);
        return { field, label: f?.label ?? field, description: f?.description ?? "", family: f?.family ?? null, weight };
      });
    const filters = knockOuts(profile, m.profile);
    const subject = m.part?.label ?? (query ? query.charAt(0).toUpperCase() + query.slice(1) : "This part");
    const top = dimensions.slice(0, 3);
    const share = top.reduce((s, d) => s + d.weight, 0);
    const names = top.map((d) => short(d.label));
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : (names[0] ?? "the official risk weights");
    const why = `${subject} is ${CHARACTER[m.profile] ?? "a general part"}, so ${list} carry ${pct(share)} of the weight${filters.length ? " and a failing score there rules a supplier out" : ""}.`;
    const result = {
      query,
      part: m.part ? { id: m.part.id, label: m.part.label, group: m.part.group, criticality: m.part.criticality } : null,
      matched_by: m.matched_by,
      profile_id: m.profile,
      profile_label: profile?.label ?? m.profile,
      dimensions,
      filters,
      why,
    };
    return { ...result, handle: ctx.putResult(result) };
  },
  summarize: (r) =>
    `${r.part?.label ?? r.query} -> profile ${r.profile_id}${r.matched_by === "default" ? " (no part matched, default weights)" : ""}. ` +
    `Top dimensions: ${r.dimensions.map((d) => `${d.field} ${pct(d.weight)}`).join(", ")}. ` +
    `Suggested filters: ${r.filters.map(conditionText).join(" AND ") || "none"}. ${r.why}`,
  view: (_r, handle) => `root = Guidance("${handle}")`,
  examples: ["Which filters matter when procuring brakes?", "What should I look for when sourcing HVAC units?"],
  workedExamples: [
    { question: "Which filters matter when procuring brakes?", input: { part: "brakes" } },
    { question: "What matters for this part?", input: {} },
  ],
});
