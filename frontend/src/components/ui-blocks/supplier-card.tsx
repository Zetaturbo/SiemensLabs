"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { ExternalLink, GitCompareArrows, Globe, Sparkles } from "lucide-react";
import { Button } from "@/design-system/react";
import { useBlockEnv } from "./block-context";
import { FIELD_META, asLevel, formatValue, labelOf, levelFor, levelOf, num, signed, str, supplierLabel } from "./fields";
import { BlockEmpty, BlockFrame, Eyebrow, LevelChip, Num, PinButton, RiskBar, WORSE, WithResult } from "./primitives";
import type { BlockProps } from "./specs";

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
  if (Array.isArray(d.contributions)) for (const c of d.contributions as Rec[]) if (typeof c?.field === "string" && flat[c.field] === undefined) flat[c.field] = c.value;
  return flat;
}

const FACTS = [
  ["delivery_rating", "Delivery"],
  ["order_confirmation_rate", "Confirmation"],
  ["order_change_rate", "Change rate"],
  ["po_volume_eur", "PO volume"],
  ["sourcing_risk_level", "Sourcing risk"],
  ["supply_chain_complexity", "Complexity"],
] as const;

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
        const facts = FACTS.filter(([f]) => s[f] !== undefined && s[f] !== null);

        return (
          <BlockFrame
            block="supplier-card"
            title={
              <span className="flex items-baseline gap-2">
                {supplierLabel(s)}
                <span className="font-mono text-2xs font-normal text-tertiary">{id}</span>
              </span>
            }
            subtitle="Synthetic name: link a real legal entity before web research."
            actions={<PinButton supplierId={id} />}
          >
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-14 flex-col items-center justify-center rounded-lg border border-subtle bg-sunken">
                <Num className="text-xl font-semibold leading-none text-ink">{tri ?? "–"}</Num>
                <span className="mt-0.5 text-2xs uppercase tracking-wide text-tertiary">TRI</span>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-2">
                  <RiskBar value={tri} level={level} width="w-32" />
                  <LevelChip level={level} />
                </div>
                {percentile !== null && (
                  <p className="text-xs text-subtext">
                    Riskier than <Num>{percentile.toFixed(1)}</Num>% of the 10,000 suppliers.
                  </p>
                )}
              </div>
            </div>

            {drivers.length > 0 && (
              <div className="mt-3">
                <Eyebrow>{contributions.length ? "Top drivers vs mean" : "Highest scores"}</Eyebrow>
                <ul className="space-y-0.5">
                  {drivers.map((d) => (
                    <li key={d.field} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-ink">{labelOf(d.field)}</span>
                      <span className="flex items-center gap-1.5">
                        <Num className="text-ink">{d.value ?? "–"}</Num>
                        <LevelChip level={levelFor(s, d.field) ?? levelOf(d.value)} className="w-[60px]" />
                        {d.extra && <Num className={`w-11 text-right ${WORSE}`}>{d.extra}</Num>}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {critical.length > 0 && (
              <p className="mt-2 text-xs text-subtext">
                <span className="font-semibold text-[var(--risk-critical)]">
                  Critical on <Num>{critical.length}</Num>:
                </span>{" "}
                {critical.map((f) => labelOf(f).toLowerCase()).join(", ")}
              </p>
            )}

            {facts.length > 0 && (
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-subtle pt-2">
                {facts.map(([f, label]) => (
                  <div key={f} className="min-w-0">
                    <dt className="truncate text-2xs uppercase tracking-wide text-tertiary">{label}</dt>
                    <dd className="text-xs text-ink">{FIELD_META[f]?.kind === "category" ? String(s[f]) : <Num>{formatValue(f, s[f])}</Num>}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" leading={<ExternalLink />} onClick={() => dispatch({ type: "open_supplier", id })}>
                Open
              </Button>
              {ask && (
                <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" leading={<Sparkles />} onClick={() => ask(`Why is ${id} rated ${level ?? "this way"}? Explain the score.`)}>
                  Explain score
                </Button>
              )}
              {ask && (
                <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" leading={<GitCompareArrows />} onClick={() => ask(`Find suppliers similar to ${id} with lower risk`)}>
                  Find alternatives
                </Button>
              )}
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" leading={<Globe />} onClick={() => dispatch({ type: "start_research", supplier_id: id })} title="Research the linked legal entity on the web">
                Research
              </Button>
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const SupplierCardBlock: ComponentRenderer<BlockProps<"SupplierCard">> = ({ props }) => <SupplierCardView resultId={props.resultId} supplierId={props.supplierId} />;
