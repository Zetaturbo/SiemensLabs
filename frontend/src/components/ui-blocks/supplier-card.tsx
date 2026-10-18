"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { useBlockEnv } from "./block-context";
import { FIELD_META, asLevel, formatValue, labelOf, levelFor, levelOf, num, signed, str, supplierLabel } from "./fields";
import { BlockEmpty, BlockFrame, LevelChip, PinButton, RiskBar, SmallButton, WithResult, cx } from "./primitives";

type Rec = Record<string, unknown>;

const SCORES = Object.entries(FIELD_META)
  .filter(([, m]) => m.family)
  .map(([k]) => k);

/** Accepts explain_supplier, get_suppliers / compare_suppliers / filter_suppliers (pick by id), or a single supplier record. */
export function pickSupplier(data: unknown, supplierId?: string | null): Rec | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Rec;
  const list = Array.isArray(data) ? data : Array.isArray(d.suppliers) ? d.suppliers : Array.isArray(d.ranking) ? d.ranking : Array.isArray(d.similar) ? d.similar : null;
  if (list) {
    const recs = list.filter((r): r is Rec => !!r && typeof r === "object");
    return (supplierId ? recs.find((r) => r.supplier_id === supplierId) : recs[0]) ?? null;
  }
  if (typeof d.supplier_id !== "string") return null;
  // explain_supplier: flatten operational_metrics and context next to the scores.
  const flat: Rec = { ...d };
  for (const key of ["operational_metrics", "context"]) if (d[key] && typeof d[key] === "object") Object.assign(flat, d[key] as Rec);
  if (Array.isArray(d.contributions))
    for (const c of d.contributions as Rec[]) if (typeof c?.field === "string" && flat[c.field] === undefined) flat[c.field] = c.value;
  return flat;
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0" title={hint}>
      <dt className="truncate text-[10px] uppercase tracking-wide text-zinc-400">{label}</dt>
      <dd className="font-mono text-xs tabular-nums">{value}</dd>
    </div>
  );
}

export function SupplierCardView({ resultId, data, supplierId }: { resultId?: string | null; data?: unknown; supplierId?: string | null }) {
  const { dispatch, ask } = useBlockEnv();
  return (
    <WithResult block="supplier-card" resultId={resultId} data={data} skeletonRows={4}>
      {(value) => {
        const s = pickSupplier(value, supplierId);
        if (!s) return <BlockEmpty block="supplier-card" title="Supplier" message={supplierId ? `${supplierId} is not in this result.` : "No supplier in this result."} />;
        const id = str(s.supplier_id) ?? "unknown";
        const tri = num(s.total_risk_index);
        const level = levelFor(s, "total_risk_index") ?? asLevel(s.total_risk_level);
        const percentile = num(s.percentile);
        const contributions = Array.isArray(s.contributions) ? (s.contributions as Rec[]).filter((c) => typeof c?.field === "string" && num(c.contribution_vs_mean) !== null) : [];
        const drivers = contributions.length
          ? contributions
              .filter((c) => num(c.contribution_vs_mean)! > 0)
              .slice(0, 3)
              .map((c) => ({ field: c.field as string, value: num(c.value), extra: signed(num(c.contribution_vs_mean)!, 2) }))
          : SCORES.map((f) => ({ field: f, value: num(s[f]), extra: "" }))
              .filter((x) => x.value !== null)
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .slice(0, 3);
        const critical = Array.isArray(s.critical_fields)
          ? (s.critical_fields as unknown[]).filter((f): f is string => typeof f === "string")
          : SCORES.filter((f) => levelFor(s, f) === "Critical");
        const facts: Array<[string, string]> = (
          [
            ["delivery_rating", "Delivery"],
            ["order_confirmation_rate", "Confirmation"],
            ["order_change_rate", "Change rate"],
            ["po_volume_eur", "PO volume"],
            ["sourcing_risk_level", "Sourcing risk"],
            ["supply_chain_complexity", "Complexity"],
          ] as const
        )
          .filter(([f]) => s[f] !== undefined && s[f] !== null)
          .map(([f, label]) => [label, formatValue(f, s[f])]);

        return (
          <BlockFrame
            block="supplier-card"
            title={
              <span className="flex items-baseline gap-2">
                {supplierLabel(s)}
                <span className="font-mono text-[11px] font-normal text-zinc-400">{id}</span>
              </span>
            }
            subtitle="Synthetic supplier name: link a real legal entity before web research."
            actions={<PinButton supplierId={id} />}
          >
            <div className="flex items-center gap-3">
              <div className={cx("flex h-12 w-14 flex-col items-center justify-center rounded-md ring-1 ring-inset ring-zinc-200 dark:ring-zinc-700")}>
                <span className="font-mono text-lg font-semibold leading-none tabular-nums">{tri ?? "–"}</span>
                <span className="mt-0.5 text-[9px] uppercase tracking-wide text-zinc-400">TRI</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <RiskBar value={tri} level={level} width="w-32" />
                  <LevelChip level={level} />
                </div>
                {percentile !== null && <p className="text-[11px] text-zinc-500 dark:text-zinc-400">Riskier than {percentile.toFixed(1)}% of the 10,000 suppliers.</p>}
              </div>
            </div>

            {drivers.length > 0 && (
              <div className="mt-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{contributions.length ? "Top drivers vs mean" : "Highest scores"}</p>
                <ul className="space-y-0.5">
                  {drivers.map((d) => (
                    <li key={d.field} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate">{labelOf(d.field)}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono tabular-nums">{d.value ?? "–"}</span>
                        <LevelChip level={levelFor(s, d.field) ?? levelOf(d.value)} />
                        {d.extra && <span className="w-10 text-right font-mono text-[11px] text-red-600 tabular-nums dark:text-red-400">{d.extra}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {critical.length > 0 && (
              <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                <span className="font-semibold text-red-700 dark:text-red-300">Critical on {critical.length}:</span> {critical.map((f) => labelOf(f).toLowerCase()).join(", ")}
              </p>
            )}

            {facts.length > 0 && (
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-zinc-100 pt-2 dark:border-zinc-800">
                {facts.map(([label, v]) => (
                  <Fact key={label} label={label} value={v} />
                ))}
              </dl>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <SmallButton onClick={() => dispatch({ type: "open_supplier", id })}>Open</SmallButton>
              {ask && <SmallButton onClick={() => ask(`Why is ${id} rated ${level ?? "this way"}? Explain the score.`)}>Explain score</SmallButton>}
              {ask && <SmallButton onClick={() => ask(`Find suppliers similar to ${id} with lower risk`)}>Find alternatives</SmallButton>}
              <SmallButton onClick={() => dispatch({ type: "start_research", supplier_id: id })} title="Research the linked legal entity on the web">
                Research
              </SmallButton>
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const SupplierCard = defineComponent({
  name: "SupplierCard",
  description:
    "Compact card for one supplier: total risk index with level and percentile, top risk drivers, Critical fields, delivery and volume facts, " +
    "pin, explain, alternatives and research actions. Use for explain_supplier or get_suppliers results.",
  props: z.object({
    resultId: z.string().describe("Handle of an explain_supplier, get_suppliers or compare_suppliers result"),
    supplierId: z.string().optional().describe("Which supplier to show when the result holds several"),
  }),
  component: ({ props }) => <SupplierCardView resultId={props.resultId} supplierId={props.supplierId} />,
});
