"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/design-system/react";
import { useBlockEnv } from "./block-context";
import { FIELD_META, asLevel, formatValue, labelOf, levelFor, levelOf, num, str, supplierLabel } from "./fields";
import { BlockEmpty, BlockFrame, LevelDot, Num, PinButton, RiskBar, WithResult } from "./primitives";
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

/** Three facts at most: the operational numbers a buyer checks first. */
const FACTS = [
  ["delivery_rating", "Delivery"],
  ["order_confirmation_rate", "Confirmation"],
  ["po_volume_eur", "PO volume"],
] as const;

export function SupplierCardView({ resultId, data, supplierId }: { resultId?: string | null; data?: unknown; supplierId?: string | null }) {
  const { dispatch } = useBlockEnv();
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
        // Top three drivers: the largest positive contributions when the result explains the score, else the highest scores.
        const drivers = contributions.length
          ? contributions
              .filter((c) => num(c.contribution_vs_mean)! > 0)
              .sort((a, b) => num(b.contribution_vs_mean)! - num(a.contribution_vs_mean)!)
              .slice(0, 3)
              .map((c) => ({ field: c.field as string, value: num(c.value) }))
          : SCORES.map((f) => ({ field: f, value: num(s[f]) }))
              .filter((x) => x.value !== null)
              .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
              .slice(0, 3);
        const facts = FACTS.filter(([f]) => num(s[f]) !== null);
        const note = `${id}. The name is synthetic: link a real legal entity before web research.${percentile !== null ? ` Riskier than ${percentile.toFixed(0)}% of the 10,000 suppliers.` : ""}`;

        return (
          <BlockFrame block="supplier-card" title={supplierLabel(s)} note={note} actions={<PinButton supplierId={id} />}>
            <div className="flex items-baseline gap-3">
              <Num className="text-3xl font-semibold leading-none text-ink">{tri ?? "–"}</Num>
              <LevelDot level={level} />
              <span className="text-sm text-subtext">total risk index</span>
            </div>

            {drivers.length > 0 && (
              <ul className="mt-4 max-w-md space-y-2">
                {drivers.map((d) => (
                  <li key={d.field} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm text-ink">{labelOf(d.field)}</span>
                    <RiskBar value={d.value} level={levelFor(s, d.field) ?? levelOf(d.value)} width="w-24 @md:w-32" />
                  </li>
                ))}
              </ul>
            )}

            {facts.length > 0 && (
              <dl className="mt-4 grid max-w-md grid-cols-3 gap-3 border-t border-subtle pt-3">
                {facts.map(([f, label]) => (
                  <div key={f} className="min-w-0">
                    <dt className="truncate text-sm text-subtext">{label}</dt>
                    <dd className="text-base text-ink">
                      <Num>{formatValue(f, s[f])}</Num>
                    </dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-4 flex">
              <Button size="sm" variant="ghost" className="-ml-2" trailing={<ArrowUpRight />} onClick={() => dispatch({ type: "open_supplier", id })}>
                Open supplier
              </Button>
            </div>
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const SupplierCardBlock: ComponentRenderer<BlockProps<"SupplierCard">> = ({ props }) => <SupplierCardView resultId={props.resultId} supplierId={props.supplierId} />;
