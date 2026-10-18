/**
 * Prints reproducible supplier picks for the seeded sourcing cases (src/lib/cases/seed.ts).
 *
 *   pnpm tsx scripts/pick-seed.ts            all cases
 *   pnpm tsx scripts/pick-seed.ts doors      one part
 *
 * Rules (the same ones `pnpm check:seed` enforces):
 *   filters    = the profile's knock-out rules (FALLBACK_KNOCKOUTS, what the case screen presets)
 *   pool       = the top POOL suppliers of rank_with_profile over those filters (a buyer pins from the top of the ranked list)
 *   shortlist  = `pins` ids from the pool, minus ids another case already uses, in a stable hash order per part
 *   finalists  = the top 3 of the shortlist by rank_with_profile (the "top 3 compared")
 *   awarded    = the first finalist
 * It also drafts the decision rationale, the research findings and the risk summary from the rows.
 */
import { PARTS, SCORES, countMatching, getRows, knockouts, levelFields, rankAll, rankIds, type Row } from "./seed-engine";
import { FALLBACK_PROFILES } from "@/components/case/domain";
import type { Stage } from "@/lib/cases/types";

const POOL = 60;

/** Stage mix decided by the product owner: 3 awarded, 3 finalists, 4 shortlist, 2 long list, 1 not started. */
export const PLAN: Array<{ part: string; stage: Stage; pins: number }> = [
  { part: "brake_system", stage: "shortlist", pins: 6 },
  { part: "bogie_wheelsets", stage: "finalists", pins: 5 },
  { part: "couplers", stage: "awarded", pins: 6 },
  { part: "doors", stage: "shortlist", pins: 4 },
  { part: "pantograph", stage: "awarded", pins: 5 },
  { part: "traction_motors", stage: "finalists", pins: 6 },
  { part: "train_control", stage: "finalists", pins: 7 },
  { part: "car_body", stage: "shortlist", pins: 5 },
  { part: "traction_converter", stage: "shortlist", pins: 4 },
  { part: "hvac", stage: "awarded", pins: 7 },
  { part: "interiors", stage: "long_list", pins: 0 },
  { part: "battery_aux", stage: "long_list", pins: 0 },
  { part: "cab_hmi", stage: "none", pins: 0 },
];

/** FNV-1a: a stable, seedless order per part so every run picks the same ids. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

const LEVEL_RANK: Record<string, number> = { Low: 0, Medium: 1, High: 2, Critical: 3 };

/** A profile dimension as the buyer reads it (derived risks shown as the underlying metric). */
function dim(row: Row, field: string): { label: string; value: number; lowerIsBetter: boolean } {
  if (field === "delivery_risk") return { label: "delivery rating", value: Number(row.delivery_rating), lowerIsBetter: false };
  if (field === "confirmation_risk") return { label: "order confirmation rate", value: Number(row.order_confirmation_rate), lowerIsBetter: false };
  if (field === "change_risk") return { label: "order change rate", value: Number(row.order_change_rate), lowerIsBetter: true };
  return { label: field, value: Number(row[field]), lowerIsBetter: true };
}

const fmt = (label: string, v: number) => (label.endsWith("rate") || label === "delivery rating" ? `${label} ${v.toFixed(1)} %` : `${label} ${v}`);

/** Profile dimensions where the winner is best among the finalists, biggest weighted lead first. */
function leads(winner: Row, others: Row[], weights: Record<string, number>) {
  return Object.entries(weights)
    .map(([field, w]) => {
      const d = dim(winner, field);
      const rest = others.map((o) => dim(o, field).value);
      const best = d.lowerIsBetter ? Math.min(...rest) : Math.max(...rest);
      const gap = d.lowerIsBetter ? best - d.value : d.value - best;
      return { field, label: d.label, value: d.value, gap, weighted: gap * w };
    })
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.weighted - a.weighted);
}

/** A High or Critical score of another finalist on which the winner sits at least one level lower (profile dims first). */
function beatenFlag(winner: Row, others: Row[], weights: Record<string, number>) {
  const flags = others.flatMap((o) =>
    SCORES.map((s) => ({ id: o.supplier_id, field: s.field, value: Number(o[s.field]), level: String(o[`${s.field}_level`]), mine: String(winner[`${s.field}_level`]), w: weights[s.field] ?? 0 }))
      .filter((f) => LEVEL_RANK[f.level] >= 2 && LEVEL_RANK[f.mine] < LEVEL_RANK[f.level]),
  );
  return flags.sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || b.w - a.w || b.value - a.value)[0] ?? null;
}

/** One-line research finding from the row: Critical scores, else High scores, else the weakest profile dimension. */
function finding(row: Row, weights: Record<string, number>): string {
  const list = (fs: string[]) => fs.map((f) => `${f} ${row[f]}`).join(", ");
  const crit = levelFields(row, "Critical");
  if (crit.length) return `${crit.length} Critical score${crit.length > 1 ? "s" : ""} (${list(crit)})`;
  const high = levelFields(row, "High");
  if (high.length) return `no Critical scores, ${high.length} High (${list(high)})`;
  const weakest = Object.entries(weights)
    .filter(([f]) => SCORES.some((s) => s.field === f))
    .sort((a, b) => b[1] * Number(row[b[0]]) - a[1] * Number(row[a[0]]))[0]?.[0];
  return `no High or Critical scores${weakest ? `; weakest profile dimension ${weakest} ${row[weakest]} (${row[`${weakest}_level`]})` : ""}`;
}

const PROFILE_NAME: Record<string, string> = { safety_critical: "safety-critical", strategic_system: "strategic-system", commodity: "commodity", lksg_due_diligence: "LkSG", default: "default" };

async function main() {
  const only = process.argv[2];
  const used = new Set<string>();
  for (const step of PLAN) {
    const part = PARTS.find((p) => p.id === step.part);
    if (!part) throw new Error(`unknown part ${step.part}`);
    const profile = part.profile;
    const weights = FALLBACK_PROFILES.find((p) => p.profile_id === profile)?.weights ?? {};
    const filters = knockouts(profile);
    const matching = await countMatching(filters);
    const { ranking } = await rankAll(filters, profile, POOL);
    const pool = ranking.filter((r) => !used.has(r.supplier_id));
    const shortlist = [...pool].sort((a, b) => hash(`${part.id}:${a.supplier_id}`) - hash(`${part.id}:${b.supplier_id}`)).slice(0, step.pins).map((r) => r.supplier_id);
    shortlist.forEach((id) => used.add(id));
    if (only && only !== part.id) continue;

    console.log(`\n=== ${part.id} (${part.label}) · ${step.stage} · profile ${profile}`);
    console.log(`filters ${JSON.stringify(filters)}`);
    console.log(`matching ${matching}`);
    if (!shortlist.length) continue;

    const ranked = await rankIds(shortlist, profile);
    const rows = new Map((await getRows(shortlist)).map((r) => [r.supplier_id, r]));
    const poolRank = new Map(ranking.map((r) => [r.supplier_id, r.rank]));
    // The seed stores the shortlist in rank order (pinned top-down from the ranked list), so finalists = its first 3.
    console.log(`shortlist (rank order) ${JSON.stringify(ranked.map((r) => r.supplier_id))}`);
    for (const r of ranked) {
      const row = rows.get(r.supplier_id)!;
      console.log(
        `  #${r.rank} ${r.supplier_id} ${String(row.supplier_name).padEnd(28)} score ${r.profile_score.toFixed(2).padStart(6)}  pool #${poolRank.get(r.supplier_id)}  ` +
          `TRI ${row.total_risk_index} ${row.total_risk_index_level}  critical [${levelFields(row, "Critical").join(", ")}]`,
      );
    }
    const top = rows.get(ranked[0].supplier_id)!;
    const finals = ["finalists", "awarded"].includes(step.stage) ? ranked.slice(0, 3).map((r) => r.supplier_id) : [];
    const summaryRow = finals.length ? rows.get(finals[0])! : top;
    console.log(`riskSummary { level: "${summaryRow.total_risk_index_level}", flagCount: ${levelFields(summaryRow, "Critical").length} } from ${summaryRow.supplier_id}`);
    console.log(`names ${JSON.stringify(Object.fromEntries(shortlist.map((id) => [id, rows.get(id)!.supplier_name])))}`);
    if (!finals.length) continue;

    console.log(`finalists ${JSON.stringify(finals)}`);
    for (const id of finals) console.log(`  research finished on ${id}: ${finding(rows.get(id)!, weights)}`);
    const [w, ...others] = finals.map((id) => rows.get(id)!);
    const sc = new Map(ranked.map((r) => [r.supplier_id, r.profile_score]));
    const lead = leads(w, others, weights).slice(0, 2);
    const flag = beatenFlag(w, others, weights);
    const profileName = PROFILE_NAME[profile] ?? profile;
    const s1 =
      `${w.supplier_id} has the lowest ${profileName} profile score of the three finalists (${sc.get(w.supplier_id)!.toFixed(2)} vs ` +
      `${others.map((o) => `${sc.get(o.supplier_id)!.toFixed(2)} for ${o.supplier_id}`).join(" and ")})` +
      (lead.length ? `, leading on ${lead.map((l) => fmt(l.label, l.value)).join(" and ")}.` : ".");
    const ownHigh = [...levelFields(w, "Critical"), ...levelFields(w, "High")];
    const maxWeight = Math.max(0, ...ownHigh.map((f) => weights[f] ?? 0));
    const s2 = flag
      ? `It avoids the ${flag.level} ${flag.field} of ${flag.id} (${flag.value}; ${w.supplier_id} ${w[flag.field]}).`
      : ownHigh.length
        ? `It still carries High ${ownHigh.map((f) => `${f} ${w[f]}`).join(", ")}, which the ${profileName} profile weights at ${Math.round(maxWeight * 100)} % or less, so they stay open as award conditions.`
        : "No finalist carries a High or Critical score, so the profile score decides.";
    console.log(`${step.stage === "awarded" ? "awarded" : "top finalist (would be awarded)"} ${w.supplier_id}`);
    if (step.stage === "awarded") console.log(`decision.rationale "${s1} ${s2}"`);
  }
}

void main();
