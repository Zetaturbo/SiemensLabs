"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { parseCompare } from "./compare-grid";
import { FAMILIES, FAMILY_LABEL, FIELD_META, fieldsOfFamily, formatValue, levelFor, lowerLabel, num, str, supplierLabel, type Family } from "./fields";
import { BlockEmpty, BlockFrame, Num, PinButton, SupplierLink, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;
export type VerdictFamily = Family | "overall";

const SCORE_FIELDS = Object.entries(FIELD_META)
  .filter(([, m]) => m.family)
  .map(([k]) => k);

interface Ranked {
  id: string;
  rec: Rec;
  score: number;
}

export interface VerdictResult {
  family: VerdictFamily | string;
  /** Heading text, e.g. "lowest financial risk". */
  label: string;
  /** How the score was computed, when the server says so. */
  method: string | null;
  ranking: Ranked[];
  winner: Ranked;
  runnerUp: Ranked | null;
  margin: number | null;
  deciding: { field: string; winnerValue: number; runnerValue: number | null; bestInGroup: boolean } | null;
  caveats: string[];
}

const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, Math.min(xs.length, 4) - 1).join(", ")} and ${xs.length > 4 ? `${xs.length - 3} more` : xs[Math.min(xs.length, 4) - 1]}`);
const lower = lowerLabel;

/**
 * The compare_suppliers skill computes a verdict server-side (src/skills/verdict.ts) for the focus the buyer asked
 * about and the model narrates it, so the block shows that one when it exists and no family was requested.
 */
export function serverVerdict(data: unknown): VerdictResult | null {
  const d = (data ?? {}) as Rec;
  const v = d.verdict as Rec | undefined;
  if (!v || typeof v !== "object" || typeof v.winner !== "string") return null;
  const { suppliers } = parseCompare(data);
  const recOf = (id: string): Rec => suppliers.find((s) => s.supplier_id === id) ?? { supplier_id: id };
  const ranking = (Array.isArray(v.ranking) ? (v.ranking as Rec[]) : [])
    .filter((r) => typeof r?.supplier_id === "string" && num(r.score) !== null)
    .map((r) => ({ id: r.supplier_id as string, rec: recOf(r.supplier_id as string), score: num(r.score)! }));
  const winner = ranking.find((r) => r.id === v.winner) ?? { id: v.winner as string, rec: recOf(v.winner as string), score: NaN };
  const runnerUp = typeof v.runner_up === "string" ? (ranking.find((r) => r.id === v.runner_up) ?? null) : null;
  const df = v.deciding_factor as Rec | null | undefined;
  const deciding =
    df && typeof df.field === "string" && num(df.winner_value) !== null
      ? { field: df.field, winnerValue: num(df.winner_value)!, runnerValue: num(df.runner_up_value), bestInGroup: false }
      : null;
  // Server caveats name raw fields and supplier ids and have no full stop; turn them into sentences.
  const caveats = (Array.isArray(v.caveats) ? v.caveats : []).filter((c): c is string => typeof c === "string").map((c) => humanize(c, suppliers));
  const critical = SCORE_FIELDS.filter((f) => levelFor(winner.rec, f) === "Critical").map(lower);
  if (critical.length) caveats.push(`${caveats.length ? "It" : supplierLabel(winner.rec)} is Critical on ${list(critical)}.`);
  return {
    family: str(v.focus) ?? "overall",
    label: `lowest ${str(v.focus_label) ?? `${str(v.focus) ?? "overall"} risk`}`,
    method: str(v.method),
    ranking,
    winner,
    runnerUp,
    margin: num(v.margin),
    deciding,
    caveats,
  };
}

/** "SUPP_00012 has the best credit_rating (57)" -> "Dynamic Group 434 has the best credit rating (57)." */
function humanize(text: string, suppliers: Rec[]): string {
  const out = text
    .replace(/SUPP_\d{5}/g, (id) => supplierLabel(suppliers.find((s) => s.supplier_id === id), id))
    .replace(/\b[a-z]+(?:_[a-z]+)+\b/g, (f) => (FIELD_META[f] ? lower(f) : f.replace(/_/g, " ")))
    .trim();
  return /[.!?]$/.test(out) ? out : `${out}.`;
}

/** Pure derivation from a compare_suppliers result (family_scores first, per_field for best/worst). */
export function deriveVerdict(data: unknown, family: VerdictFamily = "financial"): VerdictResult | null {
  const { suppliers, perField, familyScores } = parseCompare(data);
  if (suppliers.length === 0) return null;
  const fields = family === "overall" ? ["total_risk_index"] : fieldsOfFamily(family);

  const scoreOf = (s: Rec): number | null => {
    if (family === "overall") return num(s.total_risk_index);
    const fs = familyScores.find((f) => f.supplier_id === s.supplier_id);
    const given = fs ? num(fs[family]) : null;
    if (given !== null) return given;
    // Fallback: official weights renormalized inside the family (same rule as the data service).
    let w = 0;
    let acc = 0;
    for (const f of fields) {
      const v = num(s[f]);
      const wt = FIELD_META[f]?.weight ?? 0;
      if (v !== null && wt > 0) {
        acc += v * wt;
        w += wt;
      }
    }
    return w > 0 ? acc / w : null;
  };

  const ranking = suppliers
    .map((rec) => ({ id: rec.supplier_id as string, rec, score: scoreOf(rec) }))
    .filter((r): r is Ranked => r.score !== null)
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  if (ranking.length === 0) return null;
  const [winner, runnerUp = null] = ranking;
  const margin = runnerUp ? runnerUp.score - winner.score : null;

  // Deciding factor: the field where the winner beats the runner-up by the most weighted points.
  const candidates = family === "overall" ? SCORE_FIELDS : fields;
  let deciding: VerdictResult["deciding"] = null;
  let bestGap = -Infinity;
  for (const f of candidates) {
    const wv = num(winner.rec[f]);
    if (wv === null) continue;
    const rv = runnerUp ? num(runnerUp.rec[f]) : null;
    const bestInGroup = perField.get(f)?.best === winner.id;
    const gap = (rv === null ? 0 : (rv - wv) * (FIELD_META[f]?.weight ?? 0.05)) + (bestInGroup ? 0.001 : 0);
    if (gap > bestGap) {
      bestGap = gap;
      deciding = { field: f, winnerValue: wv, runnerValue: rv, bestInGroup };
    }
  }

  const name = supplierLabel(winner.rec);
  const caveats: string[] = [];
  if (runnerUp && margin !== null && margin < 3) caveats.push(`It is a close call: ${supplierLabel(runnerUp.rec)} is only ${margin.toFixed(1)} points behind.`);
  const worstOn = [...perField.values()].filter((p) => p.worst === winner.id && FIELD_META[p.field]?.family).map((p) => lower(p.field));
  if (worstOn.length) caveats.push(`${name} is the worst of this group on ${list(worstOn)}.`);
  const critical = SCORE_FIELDS.filter((f) => levelFor(winner.rec, f) === "Critical").map(lower);
  if (critical.length) caveats.push(`It is Critical on ${list(critical)}.`);
  const tri = num(winner.rec.total_risk_index);
  const triLevel = levelFor(winner.rec, "total_risk_index");
  if (family !== "overall" && tri !== null && (triLevel === "High" || triLevel === "Critical")) caveats.push(`Its total risk index is still ${triLevel} at ${tri}.`);
  if (family !== "overall") {
    const lowestTri = [...suppliers].sort((a, b) => (num(a.total_risk_index) ?? 999) - (num(b.total_risk_index) ?? 999))[0];
    if (lowestTri && lowestTri.supplier_id !== winner.id && num(lowestTri.total_risk_index) !== null)
      caveats.push(`${supplierLabel(lowestTri)} has the lowest total risk index, ${num(lowestTri.total_risk_index)}.`);
  }
  const label = family === "overall" ? "lowest overall risk" : `lowest ${FAMILY_LABEL[family].toLowerCase()} risk`;
  return { family, label, method: null, ranking, winner, runnerUp, margin, deciding, caveats };
}

const fmt1 = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/** What the score is, in words: "financial family score", "total risk index", or the server's focus label. */
function scoreName(v: VerdictResult): string {
  if (v.family === "overall") return "total risk index";
  if (FAMILIES.includes(v.family as Family)) return `${FAMILY_LABEL[v.family as Family].toLowerCase()} family score`;
  return `${v.label.replace(/^lowest /, "")} score`;
}

export function VerdictView({ resultId, data, family }: { resultId?: string | null; data?: unknown; family?: VerdictFamily | null }) {
  const requested = family && (family === "overall" || FAMILIES.includes(family as Family)) ? family : null;
  return (
    <WithResult block="verdict" resultId={resultId} data={data} skeletonRows={3}>
      {(value) => {
        const fromServer = serverVerdict(value);
        const v = fromServer && (!requested || fromServer.family === requested) ? fromServer : deriveVerdict(value, requested ?? "financial");
        if (!v) return <BlockEmpty block="verdict" title="Verdict" message="No comparable suppliers in this result." />;
        if (!v.runnerUp) return <BlockEmpty block="verdict" title="Verdict" message="A verdict needs at least two suppliers." />;
        const { winner, runnerUp, margin, deciding } = v;
        const hasScore = Number.isFinite(winner.score);
        const title = v.label.charAt(0).toUpperCase() + v.label.slice(1);
        const note = [v.method, "Price, category and delivery country are not in the dataset; add quotes to weigh cost."].filter(Boolean).join(" ");
        const lead =
          hasScore && margin !== null
            ? `It leads with a ${scoreName(v)} of ${fmt1(winner.score)}, ${fmt1(margin)} points ahead of ${supplierLabel(runnerUp.rec)} at ${fmt1(runnerUp.score)}.`
            : `It leads ${supplierLabel(runnerUp.rec)} on the ${scoreName(v)}.`;
        const why = deciding
          ? deciding.runnerValue !== null
            ? ` The deciding factor is ${lower(deciding.field)}: ${formatValue(deciding.field, deciding.winnerValue)} against ${formatValue(deciding.field, deciding.runnerValue)}.`
            : ` Its strongest dimension is ${lower(deciding.field)} at ${formatValue(deciding.field, deciding.winnerValue)}.`
          : "";
        return (
          <BlockFrame block="verdict" title={title} note={note} actions={<PinButton supplierId={winner.id} />}>
            <div className="flex items-baseline justify-between gap-4">
              <SupplierLink id={winner.id} className="text-lg font-semibold">
                {supplierLabel(winner.rec)}
              </SupplierLink>
              {hasScore && <Num className="shrink-0 text-2xl font-semibold text-ink">{fmt1(winner.score)}</Num>}
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              {lead}
              {why}
            </p>
            {v.caveats.length > 0 && <p className="mt-2 text-sm leading-relaxed text-subtext">{v.caveats.slice(0, 2).join(" ")}</p>}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const VerdictBlock: ComponentRenderer<BlockProps<"Verdict">> = ({ props }) => <VerdictView resultId={props.resultId} family={props.family} />;
