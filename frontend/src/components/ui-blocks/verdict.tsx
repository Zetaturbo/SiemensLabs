"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { parseCompare } from "./compare-grid";
import { FAMILIES, FAMILY_LABEL, FIELD_META, fieldsOfFamily, formatValue, labelOf, levelFor, levelOf, num, supplierLabel, type Family } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, PinButton, RiskBar, SupplierLink, WithResult } from "./primitives";

type Rec = Record<string, unknown>;
export type VerdictFamily = Family | "overall";

const SCORE_FIELDS = Object.entries(FIELD_META)
  .filter(([, m]) => m.family)
  .map(([k]) => k);

export interface VerdictResult {
  family: VerdictFamily;
  ranking: Array<{ id: string; rec: Rec; score: number }>;
  winner: { id: string; rec: Rec; score: number };
  runnerUp: { id: string; rec: Rec; score: number } | null;
  margin: number | null;
  deciding: { field: string; winnerValue: number; runnerValue: number | null; bestInGroup: boolean } | null;
  caveats: string[];
}

/** Pure derivation from a compare_suppliers result, exported for tests and other screens. */
export function deriveVerdict(data: unknown, family: VerdictFamily = "financial"): VerdictResult | null {
  const { suppliers, perField, familyScores } = parseCompare(data);
  if (suppliers.length === 0) return null;
  const fields = family === "overall" ? ["total_risk_index"] : fieldsOfFamily(family);

  const scoreOf = (s: Rec): number | null => {
    if (family === "overall") return num(s.total_risk_index);
    const fs = familyScores.find((f) => f.supplier_id === s.supplier_id);
    const given = fs ? num(fs[family]) : null;
    if (given !== null) return given;
    // Fallback: official weights renormalized inside the family.
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
    .filter((r): r is { id: string; rec: Rec; score: number } => r.score !== null)
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
    const gap = rv === null ? 0 : (rv - wv) * (FIELD_META[f]?.weight ?? 0.05);
    const bestInGroup = perField.get(f)?.best === winner.id;
    const score = gap + (bestInGroup ? 0.001 : 0);
    if (score > bestGap) {
      bestGap = score;
      deciding = { field: f, winnerValue: wv, runnerValue: rv, bestInGroup };
    }
  }

  const caveats: string[] = [];
  if (runnerUp && margin !== null && margin < 3) caveats.push(`Close call: ${supplierLabel(runnerUp.rec)} is only ${margin.toFixed(1)} points behind.`);
  const worstOn = [...perField.values()].filter((p) => p.worst === winner.id && FIELD_META[p.field]?.family).map((p) => labelOf(p.field).toLowerCase());
  if (worstOn.length) caveats.push(`Worst of this group on ${worstOn.slice(0, 4).join(", ")}${worstOn.length > 4 ? ` and ${worstOn.length - 4} more` : ""}.`);
  const critical = SCORE_FIELDS.filter((f) => levelFor(winner.rec, f) === "Critical").map((f) => labelOf(f).toLowerCase());
  if (critical.length) caveats.push(`Critical on ${critical.slice(0, 4).join(", ")}${critical.length > 4 ? ` and ${critical.length - 4} more` : ""}.`);
  const tri = num(winner.rec.total_risk_index);
  const triLevel = levelFor(winner.rec, "total_risk_index");
  if (family !== "overall" && tri !== null && (triLevel === "High" || triLevel === "Critical")) caveats.push(`Total risk index is still ${triLevel} (${tri}).`);
  if (family !== "overall" && tri !== null) {
    const lowestTri = [...suppliers].sort((a, b) => (num(a.total_risk_index) ?? 999) - (num(b.total_risk_index) ?? 999))[0];
    if (lowestTri && lowestTri.supplier_id !== winner.id) caveats.push(`${supplierLabel(lowestTri)} has the lower total risk index (${num(lowestTri.total_risk_index)}).`);
  }
  return { family, ranking, winner, runnerUp, margin, deciding, caveats };
}

export function VerdictView({ resultId, data, family }: { resultId?: string | null; data?: unknown; family?: VerdictFamily | null }) {
  const fam: VerdictFamily = family && (family === "overall" || FAMILIES.includes(family as Family)) ? family : "financial";
  const famLabel = fam === "overall" ? "overall" : FAMILY_LABEL[fam].toLowerCase();
  return (
    <WithResult block="verdict" resultId={resultId} data={data} skeletonRows={3}>
      {(value) => {
        const v = deriveVerdict(value, fam);
        if (!v) return <BlockEmpty block="verdict" title="Verdict" message="No comparable suppliers in this result." />;
        if (!v.runnerUp) return <BlockEmpty block="verdict" title="Verdict" message="A verdict needs at least two suppliers." />;
        const { winner, runnerUp, margin, deciding } = v;
        return (
          <BlockFrame block="verdict" title={`Verdict: lowest ${famLabel} risk`} actions={<PinButton supplierId={winner.id} />}>
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" aria-hidden>
                <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-base font-semibold leading-6">
                  <SupplierLink id={winner.id}>{supplierLabel(winner.rec)}</SupplierLink>
                  <span className="ml-1.5 font-mono text-[11px] font-normal text-zinc-400">{winner.id}</span>
                </p>
                <p className="text-xs text-zinc-600 dark:text-zinc-400">
                  {fam === "overall" ? "Total risk index" : `${FAMILY_LABEL[fam]} family score`}{" "}
                  <span className="font-mono font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{winner.score.toFixed(1)}</span>
                  {margin !== null && (
                    <>
                      {" "}
                      vs <span className="font-mono tabular-nums">{runnerUp.score.toFixed(1)}</span> for {supplierLabel(runnerUp.rec)} ({margin.toFixed(1)} points ahead)
                    </>
                  )}
                </p>
                {deciding && (
                  <p className="mt-1.5 text-xs">
                    <span className="font-semibold">Deciding factor:</span> {labelOf(deciding.field).toLowerCase()}{" "}
                    <span className="font-mono tabular-nums">{formatValue(deciding.field, deciding.winnerValue)}</span>
                    {deciding.runnerValue !== null && (
                      <>
                        {" "}
                        vs <span className="font-mono tabular-nums">{formatValue(deciding.field, deciding.runnerValue)}</span>
                      </>
                    )}
                    {deciding.bestInGroup && <span className="ml-1 text-emerald-700 dark:text-emerald-400">(best in group)</span>}
                  </p>
                )}
              </div>
            </div>

            <ul className="mt-3 space-y-1">
              {v.ranking.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <span className="w-4 text-right font-mono text-zinc-400">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{supplierLabel(r.rec)}</span>
                  <RiskBar value={Math.round(r.score * 10) / 10} level={levelOf(r.score)} width="w-20" />
                  <LevelChip level={levelOf(r.score)} className="w-[58px] justify-center" />
                </li>
              ))}
            </ul>

            {v.caveats.length > 0 && (
              <div className="mt-3 rounded-md bg-amber-400/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200">
                <p className="mb-0.5 font-semibold">Caveats</p>
                <ul className="list-disc space-y-0.5 pl-4">
                  {v.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="mt-2 text-[10px] text-zinc-400">Price, category and delivery country are not in the dataset; add quotes to weigh cost.</p>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const Verdict = defineComponent({
  name: "Verdict",
  description:
    "Decision block for a comparison: the winner for one risk family, the deciding factor and caveats, derived from a compare_suppliers result. " +
    "Pair it with CompareGrid when the buyer asks which supplier is best.",
  props: z.object({
    resultId: z.string().describe("Handle of a compare_suppliers result"),
    family: z
      .enum(["financial", "operational_quality", "compliance_governance", "external_environment", "supply_chain_structure", "overall"])
      .optional()
      .describe("Risk family to decide on; 'overall' uses total_risk_index. Default financial (financial_health + credit_rating)"),
  }),
  component: ({ props }) => <VerdictView resultId={props.resultId} family={props.family} />,
});
