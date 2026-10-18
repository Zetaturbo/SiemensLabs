import { HIGHER_IS_BETTER, fmt, riskValue } from "./shared";

/**
 * Deterministic "who wins and why" for a comparison. Pure function so the
 * compare skill, the memo and the Verdict block all agree.
 */
export interface VerdictInput {
  suppliers: Array<Record<string, unknown>>;
  /** Fields that make up the focus, with weights (renormalized here). */
  fields: Array<{ field: string; weight: number }>;
  /** Precomputed focus score per supplier (lower = better), e.g. family_scores.financial. Optional. */
  scores?: Record<string, number>;
  focus: string;
  focusLabel: string;
}

export interface Verdict {
  focus: string;
  focus_label: string;
  method: string;
  ranking: Array<{ supplier_id: string; score: number }>;
  winner: string | null;
  runner_up: string | null;
  margin: number | null;
  deciding_factor: { field: string; winner_value: number; runner_up_value: number; weighted_gap: number } | null;
  /** Trade-offs a reader must not miss, e.g. "SUPP_00731 has the best financial_health (53) but the worst credit_rating (76)". */
  caveats: string[];
}

const id = (s: Record<string, unknown>) => String(s.supplier_id);
const raw = (s: Record<string, unknown>, f: string) => (typeof s[f] === "number" ? (s[f] as number) : null);

export function computeVerdict(input: VerdictInput): Verdict {
  const total = input.fields.reduce((a, f) => a + f.weight, 0) || 1;
  const fields = input.fields.map((f) => ({ field: f.field, weight: f.weight / total }));
  const scoreOf = (s: Record<string, unknown>) => {
    const pre = input.scores?.[id(s)];
    if (typeof pre === "number") return pre;
    return fields.reduce((a, f) => a + f.weight * (riskValue(f.field, s[f.field]) ?? 0), 0);
  };
  const ranking = input.suppliers
    .map((s) => ({ supplier_id: id(s), score: Math.round(scoreOf(s) * 100) / 100 }))
    .sort((a, b) => a.score - b.score || a.supplier_id.localeCompare(b.supplier_id));
  const method =
    fields.length === 1
      ? `${fields[0].field}${HIGHER_IS_BETTER.has(fields[0].field) ? " (higher is better)" : " (lower is better)"}`
      : `weighted mean of ${fields.map((f) => `${f.field} ${+f.weight.toFixed(3)}`).join(", ")} (lower is better)`;
  const base: Verdict = { focus: input.focus, focus_label: input.focusLabel, method, ranking, winner: null, runner_up: null, margin: null, deciding_factor: null, caveats: [] };
  if (ranking.length < 2) return { ...base, winner: ranking[0]?.supplier_id ?? null };

  const byId = new Map(input.suppliers.map((s) => [id(s), s]));
  const w = byId.get(ranking[0].supplier_id)!;
  const r = byId.get(ranking[1].supplier_id)!;
  let deciding: Verdict["deciding_factor"] = null;
  for (const f of fields) {
    const wv = riskValue(f.field, w[f.field]);
    const rv = riskValue(f.field, r[f.field]);
    if (wv == null || rv == null) continue;
    const gap = f.weight * (rv - wv);
    if (!deciding || gap > deciding.weighted_gap) {
      deciding = { field: f.field, winner_value: raw(w, f.field)!, runner_up_value: raw(r, f.field)!, weighted_gap: Math.round(gap * 100) / 100 };
    }
  }

  const caveats: string[] = [];
  const spreadOf = (f: string) => {
    const vals = input.suppliers.map((x) => riskValue(f, x[f])).filter((v): v is number => v != null);
    return vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  };
  if (fields.length > 6) {
    // Broad focus (overall): flag the heaviest fields where the winner is the worst of the group.
    const worst = fields
      .filter((f) => {
        const v = riskValue(f.field, w[f.field]);
        const vals = input.suppliers.map((x) => riskValue(f.field, x[f.field])).filter((x): x is number => x != null);
        return v != null && vals.length > 1 && v === Math.max(...vals) && spreadOf(f.field) > 0;
      })
      .sort((a, b) => b.weight * spreadOf(b.field) - a.weight * spreadOf(a.field))
      .slice(0, 3);
    if (worst.length) caveats.push(`${id(w)} is still the worst of the group on ${worst.map((f) => `${f.field} (${fmt(raw(w, f.field))})`).join(", ")}`);
  } else if (fields.length > 1) {
    // A supplier that is best on one focus field but worst on another is the classic trap.
    for (const s of input.suppliers) {
      const bestOn: string[] = [];
      const worstOn: string[] = [];
      for (const f of fields) {
        const vals = input.suppliers.map((x) => riskValue(f.field, x[f.field])).filter((v): v is number => v != null);
        const v = riskValue(f.field, s[f.field]);
        if (v == null || vals.length < 2 || Math.min(...vals) === Math.max(...vals)) continue;
        if (v === Math.min(...vals)) bestOn.push(f.field);
        if (v === Math.max(...vals)) worstOn.push(f.field);
      }
      if (bestOn.length && worstOn.length) {
        caveats.push(
          `${id(s)} has the best ${bestOn.map((f) => `${f} (${fmt(raw(s, f))})`).join(", ")} but the worst ${worstOn.map((f) => `${f} (${fmt(raw(s, f))})`).join(", ")}`,
        );
      }
    }
  }
  return {
    ...base,
    winner: ranking[0].supplier_id,
    runner_up: ranking[1].supplier_id,
    margin: Math.round((ranking[1].score - ranking[0].score) * 100) / 100,
    deciding_factor: deciding,
    caveats: caveats.slice(0, 3),
  };
}
