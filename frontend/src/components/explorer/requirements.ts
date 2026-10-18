import type { FilterCondition } from "@/lib/data-api/types";
import { COMPLEXITY_LEVELS, LEVELS, SOURCING_LEVELS, type Level } from "@/components/case/domain";

/**
 * Two-way mapping between the filter sidebar and filter_suppliers conditions.
 * The case store keeps conditions (the contract shape); the sidebar edits this view of them.
 * Conditions the sidebar cannot represent are kept verbatim in `other`, so nothing set by the
 * chat or a profile is silently lost.
 */

export type MaxLevel = Exclude<Level, "Critical">; // "High" = exclude Critical, "Medium", "Low"
export const RANGE_FIELDS = ["delivery_rating", "order_change_rate", "po_volume_eur"] as const;
export type RangeField = (typeof RANGE_FIELDS)[number];
export const SET_FIELDS = { sourcing_risk_level: [...SOURCING_LEVELS] as string[], supply_chain_complexity: [...COMPLEXITY_LEVELS] as string[] };
export type SetField = keyof typeof SET_FIELDS;

export interface RequirementState {
  /** score field (without _level) -> worst level still allowed */
  maxLevel: Record<string, MaxLevel>;
  ranges: Partial<Record<RangeField, { min?: number; max?: number }>>;
  /** allowed values; missing = any */
  sets: Partial<Record<SetField, string[]>>;
  other: FilterCondition[];
}

export const EMPTY_REQUIREMENTS: RequirementState = { maxLevel: {}, ranges: {}, sets: {}, other: [] };

const LV = LEVELS as string[];

function levelCeiling(c: FilterCondition): MaxLevel | null {
  const v = c.value;
  const idx = (x: unknown) => LV.indexOf(String(x));
  switch (c.op) {
    case "ne":
      return v === "Critical" ? "High" : null;
    case "eq":
      return v === "Low" ? "Low" : null;
    case "lte":
      return idx(v) >= 0 && idx(v) < 3 ? (LV[idx(v)] as MaxLevel) : null;
    case "lt":
      return idx(v) >= 1 ? (LV[idx(v) - 1] as MaxLevel) : null;
    case "in": {
      if (!Array.isArray(v) || v.length === 0 || v.length > 3) return null;
      const sorted = v.map(String).sort((a, b) => LV.indexOf(a) - LV.indexOf(b));
      return sorted.every((x, i) => x === LV[i]) ? (sorted[sorted.length - 1] as MaxLevel) : null;
    }
    case "not_in": {
      if (!Array.isArray(v) || v.length === 0 || v.length > 3) return null;
      const sorted = v.map(String).sort((a, b) => LV.indexOf(a) - LV.indexOf(b));
      const start = 4 - sorted.length;
      return sorted.every((x, i) => x === LV[start + i]) ? (LV[start - 1] as MaxLevel) : null;
    }
    default:
      return null;
  }
}

export function fromConditions(conditions: FilterCondition[]): RequirementState {
  const s: RequirementState = { maxLevel: {}, ranges: {}, sets: {}, other: [] };
  for (const c of conditions) {
    const f = c.field;
    if (f.endsWith("_level") && f !== "sourcing_risk_level") {
      const base = f.slice(0, -6);
      const ceil = levelCeiling(c);
      if (ceil && !s.maxLevel[base]) {
        s.maxLevel[base] = ceil;
        continue;
      }
    } else if ((RANGE_FIELDS as readonly string[]).includes(f)) {
      const r = { ...(s.ranges[f as RangeField] ?? {}) };
      const n = typeof c.value === "number" ? c.value : null;
      if (c.op === "gte" && n !== null && r.min === undefined) r.min = n;
      else if (c.op === "lte" && n !== null && r.max === undefined) r.max = n;
      else if (c.op === "between" && Array.isArray(c.value) && c.value.length === 2 && r.min === undefined && r.max === undefined) {
        r.min = Number(c.value[0]);
        r.max = Number(c.value[1]);
      } else {
        s.other.push(c);
        continue;
      }
      s.ranges[f as RangeField] = r;
      continue;
    } else if (f in SET_FIELDS && !s.sets[f as SetField]) {
      const all = SET_FIELDS[f as SetField];
      const v = c.value;
      let allowed: string[] | null = null;
      if (c.op === "in" && Array.isArray(v)) allowed = v.map(String);
      else if (c.op === "eq") allowed = [String(v)];
      else if (c.op === "ne") allowed = all.filter((x) => x !== String(v));
      else if (c.op === "not_in" && Array.isArray(v)) allowed = all.filter((x) => !v.map(String).includes(x));
      if (allowed) {
        s.sets[f as SetField] = all.filter((x) => allowed!.includes(x));
        continue;
      }
    }
    s.other.push(c);
  }
  return s;
}

export function toConditions(s: RequirementState): FilterCondition[] {
  const out: FilterCondition[] = [];
  for (const [field, max] of Object.entries(s.maxLevel)) {
    const lf = `${field}_level`;
    if (max === "High") out.push({ field: lf, op: "ne", value: "Critical" });
    else if (max === "Medium") out.push({ field: lf, op: "in", value: ["Low", "Medium"] });
    else if (max === "Low") out.push({ field: lf, op: "eq", value: "Low" });
  }
  for (const f of RANGE_FIELDS) {
    const r = s.ranges[f];
    if (!r) continue;
    if (r.min !== undefined) out.push({ field: f, op: "gte", value: r.min });
    if (r.max !== undefined) out.push({ field: f, op: "lte", value: r.max });
  }
  for (const [f, vals] of Object.entries(s.sets) as Array<[SetField, string[] | undefined]>) {
    if (!vals || vals.length === SET_FIELDS[f].length) continue;
    out.push({ field: f, op: "in", value: vals });
  }
  return [...out, ...s.other];
}
