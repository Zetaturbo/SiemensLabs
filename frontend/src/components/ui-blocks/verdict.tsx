"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Check } from "lucide-react";
import { Alert } from "@/design-system/react";
import { parseCompare } from "./compare-grid";
import { FAMILIES, FAMILY_LABEL, FIELD_META, fieldsOfFamily, formatValue, labelOf, levelFor, levelOf, num, str, supplierLabel, type Family } from "./fields";
import { BETTER, BlockEmpty, BlockFrame, LevelChip, Num, PinButton, RiskBar, SupplierLink, WithResult } from "./primitives";
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

const list = (xs: string[]) => `${xs.slice(0, 4).join(", ")}${xs.length > 4 ? ` and ${xs.length - 4} more` : ""}`;

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
  const caveats = (Array.isArray(v.caveats) ? v.caveats : []).filter((c): c is string => typeof c === "string");
  const critical = SCORE_FIELDS.filter((f) => levelFor(winner.rec, f) === "Critical").map((f) => labelOf(f).toLowerCase());
  if (critical.length) caveats.push(`${supplierLabel(winner.rec)} is Critical on ${list(critical)}.`);
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

  const caveats: string[] = [];
  if (runnerUp && margin !== null && margin < 3) caveats.push(`Close call: ${supplierLabel(runnerUp.rec)} is only ${margin.toFixed(1)} points behind.`);
  const worstOn = [...perField.values()].filter((p) => p.worst === winner.id && FIELD_META[p.field]?.family).map((p) => labelOf(p.field).toLowerCase());
  if (worstOn.length) caveats.push(`Worst of this group on ${list(worstOn)}.`);
  const critical = SCORE_FIELDS.filter((f) => levelFor(winner.rec, f) === "Critical").map((f) => labelOf(f).toLowerCase());
  if (critical.length) caveats.push(`Critical on ${list(critical)}.`);
  const tri = num(winner.rec.total_risk_index);
  const triLevel = levelFor(winner.rec, "total_risk_index");
  if (family !== "overall" && tri !== null && (triLevel === "High" || triLevel === "Critical")) caveats.push(`Total risk index is still ${triLevel} (${tri}).`);
  if (family !== "overall") {
    const lowestTri = [...suppliers].sort((a, b) => (num(a.total_risk_index) ?? 999) - (num(b.total_risk_index) ?? 999))[0];
    if (lowestTri && lowestTri.supplier_id !== winner.id && num(lowestTri.total_risk_index) !== null)
      caveats.push(`${supplierLabel(lowestTri)} has the lowest total risk index (${num(lowestTri.total_risk_index)}).`);
  }
  const label = family === "overall" ? "lowest overall risk" : `lowest ${FAMILY_LABEL[family].toLowerCase()} risk`;
  return { family, label, method: null, ranking, winner, runnerUp, margin, deciding, caveats };
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
        return (
          <BlockFrame block="verdict" title={`Verdict: ${v.label}`} subtitle={v.method ?? undefined} actions={<PinButton supplierId={winner.id} />}>
            <div className="flex items-start gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[var(--risk-low-soft)] text-[var(--risk-low)]" aria-hidden>
                <Check className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-md font-semibold text-ink">
                  <SupplierLink id={winner.id}>{supplierLabel(winner.rec)}</SupplierLink>
                  <span className="ml-1.5 font-mono text-2xs font-normal text-tertiary">{winner.id}</span>
                </p>
                <p className="text-xs text-subtext">
                  {v.family === "overall" ? "Score" : FAMILIES.includes(v.family as Family) ? `${FAMILY_LABEL[v.family as Family]} family score` : `${labelOf(String(v.family))}`}{" "}
                  <Num className="font-semibold text-ink">{Number.isFinite(winner.score) ? winner.score.toFixed(1) : "–"}</Num>
                  {margin !== null && (
                    <>
                      {" "}
                      vs <Num>{runnerUp.score.toFixed(1)}</Num> for {supplierLabel(runnerUp.rec)}, <Num>{margin.toFixed(1)}</Num> points ahead
                    </>
                  )}
                </p>
                {deciding && (
                  <p className="mt-1.5 text-xs text-ink">
                    <span className="font-semibold">Deciding factor:</span> {labelOf(deciding.field).toLowerCase()} <Num>{formatValue(deciding.field, deciding.winnerValue)}</Num>
                    {deciding.runnerValue !== null && (
                      <>
                        {" "}
                        vs <Num>{formatValue(deciding.field, deciding.runnerValue)}</Num>
                      </>
                    )}
                    {deciding.bestInGroup && <span className={`ml-1 ${BETTER}`}>best in group</span>}
                  </p>
                )}
              </div>
            </div>

            <ul className="mt-3 space-y-1">
              {v.ranking.map((r, i) => (
                <li key={r.id} className="flex items-center gap-2 text-xs">
                  <Num className="w-4 text-right text-tertiary">{i + 1}</Num>
                  <span className="min-w-0 flex-1 truncate text-ink">{supplierLabel(r.rec)}</span>
                  <RiskBar value={Math.round(r.score * 10) / 10} level={levelOf(r.score)} width="w-20" />
                  <LevelChip level={levelOf(r.score)} className="w-[60px]" />
                </li>
              ))}
            </ul>

            {v.caveats.length > 0 && (
              <Alert tone="warning" title="Caveats" className="mt-3 p-2.5 text-xs">
                <ul className="list-disc space-y-0.5 pl-4">
                  {v.caveats.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </Alert>
            )}
            <p className="mt-2 text-2xs text-tertiary">Price, category and delivery country are not in the dataset; add quotes to weigh cost.</p>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const VerdictBlock: ComponentRenderer<BlockProps<"Verdict">> = ({ props }) => <VerdictView resultId={props.resultId} family={props.family} />;
