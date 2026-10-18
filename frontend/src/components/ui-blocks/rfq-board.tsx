"use client";
import { useState } from "react";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { num, str } from "./fields";
import { BlockEmpty, BlockFrame, Dot, MoreButton, Num, SupplierLink, WithResult, cn } from "./primitives";
import type { BlockProps } from "./specs";

type Rec = Record<string, unknown>;

export const RFQ_BOARD_CAP = 8;

interface Offer {
  id: string;
  name: string;
  prospect: boolean;
  price: number | null;
  annual: number | null;
  qualified: boolean;
  failed: string[];
  gate: { pass: boolean; failures: string[] } | null;
  moq: number | null;
  moqFits: boolean;
}

interface Share {
  id: string;
  name: string;
  prospect: boolean;
  pct: number;
  units: number;
  cost: number;
}

/** qualify_for_rfq result: { spec, offers[], award, cheapest_qualified, gate_cost_eur, dual, moq }. */
export function parseRfq(data: unknown) {
  const d = (data ?? {}) as Rec;
  const spec = (d.spec ?? {}) as Rec;
  const offers: Offer[] = (Array.isArray(d.offers) ? (d.offers as Rec[]) : []).flatMap((o) =>
    typeof o?.supplier_id === "string"
      ? [
          {
            id: o.supplier_id,
            name: str(o.supplier_name) ?? o.supplier_id,
            prospect: o.supplier_status === "Prospect",
            price: num(o.unit_price_eur),
            annual: num(o.annual_cost_eur),
            qualified: o.qualified === true,
            failed: Array.isArray(o.failed) ? (o.failed as unknown[]).map(String) : [],
            gate: o.gate && typeof o.gate === "object" ? { pass: (o.gate as Rec).pass === true, failures: ((o.gate as Rec).failures as string[]) ?? [] } : null,
            moq: num(o.moq_units),
            moqFits: o.moq_fits !== false,
          },
        ]
      : [],
  );
  // Qualified first (cheapest first), then the excluded ones (cheapest first).
  const ordered = [...offers.filter((o) => o.qualified), ...offers.filter((o) => !o.qualified)];
  const pick = (v: unknown) => (v && typeof v === "object" ? (v as Rec) : null);
  const award = pick(d.award);
  const cheapest = pick(d.cheapest_qualified);
  const dual = pick(d.dual);
  const share = (s: unknown): Share | null => {
    const r = pick(s);
    return r && typeof r.supplier_id === "string"
      ? { id: r.supplier_id, name: str(r.supplier_name) ?? r.supplier_id, prospect: r.supplier_status === "Prospect", pct: num(r.share_pct) ?? 0, units: num(r.units) ?? 0, cost: num(r.cost_eur) ?? 0 }
      : null;
  };
  const chips = [
    ...((spec.certifications as string[] | undefined) ?? []),
    ...(spec.copper_free ? ["Copper-free"] : []),
    ...(str(spec.region) ? [`Region ${spec.region}`] : []),
    ...(num(spec.max_lead_time_days) !== null ? [`Lead time ≤ ${spec.max_lead_time_days} d`] : []),
    ...(num(spec.min_annual_capacity) !== null ? [`Capacity ≥ ${num(spec.min_annual_capacity)!.toLocaleString("en-GB")}`] : []),
    ...(spec.approved_only ? ["Approved only"] : []),
    ...(spec.risk_gate ? [`Gate: TRI < ${spec.max_total_risk_index}, FH < ${spec.max_financial_health}`] : []),
  ];
  return {
    product: str(spec.product_type),
    volume: num(spec.annual_volume),
    callOff: num(spec.monthly_call_off),
    chips,
    offers: ordered,
    qualifiedCount: offers.filter((o) => o.qualified).length,
    award: award && typeof award.supplier_id === "string" ? { id: award.supplier_id, name: str(award.supplier_name) ?? award.supplier_id, price: num(award.unit_price_eur), annual: num(award.annual_cost_eur), prospect: award.supplier_status === "Prospect" } : null,
    cheapestId: str(cheapest?.supplier_id),
    gateCost: num(d.gate_cost_eur),
    dual: dual ? { primary: share(dual.primary), secondary: share(dual.secondary), total: num(dual.total_eur), extra: num(dual.extra_vs_single_eur) } : null,
    source: str(d.source),
  };
}

const eur0 = (v: number | null) => (v === null ? "–" : `EUR ${v.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`);
const eur2 = (v: number | null) => (v === null ? "–" : v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const PASS = "var(--risk-low)";
const FAIL = "var(--risk-critical)";

const COLUMNS = ["Supplier", "Unit price (EUR)", "Annual cost", "Requirements", "Risk gate", "MOQ"] as const;

function GateCell({ o }: { o: Offer }) {
  if (!o.qualified || !o.gate) return <span className="text-tertiary">–</span>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <Dot fill={o.gate.pass ? PASS : FAIL} />
      {o.gate.pass
        ? "Pass"
        : o.gate.failures
            .map((f) => f.replace(/^Financial Health Score/, "FH").replace(/^Total Risk Index/, "TRI").replace(/ \(.*\)$/, ""))
            .join(" · ")}
    </span>
  );
}

function SplitBar({ primary, secondary }: { primary: Share; secondary: Share }) {
  return (
    <div className="space-y-2">
      <div className="flex h-2 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <span className="bg-ink" style={{ width: `${primary.pct}%` }} />
        <span className="bg-placeholder" style={{ width: `${secondary.pct}%` }} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        {[primary, secondary].map((s, i) => (
          <div key={s.id} className={cn("min-w-0", i === 1 && "text-right")}>
            <div className="truncate text-ink">
              <SupplierLink id={s.id}>{s.name}</SupplierLink>
              {s.prospect && <span className="text-subtext"> · Prospect</span>}
            </div>
            <div className="text-subtext">
              <Num>
                {s.pct}% · {s.units.toLocaleString("en-GB")} units · {eur0(s.cost)}
              </Num>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RfqBoardView({ resultId, data, title }: { resultId?: string | null; data?: unknown; title?: string | null }) {
  const [all, setAll] = useState(false);
  return (
    <WithResult block="rfq-board" resultId={resultId} data={data} skeletonRows={5}>
      {(value) => {
        const r = parseRfq(value);
        const heading =
          title ?? `RFQ${r.product ? ` · ${r.product.toLowerCase()}` : ""}${r.volume !== null ? ` · ${r.volume.toLocaleString("en-GB")} / yr` : ""} · ${r.qualifiedCount} of ${r.offers.length} qualified`;
        if (!r.offers.length) return <BlockEmpty block="rfq-board" title={heading} message="No supplier offers this product." />;
        const shown = all ? r.offers : r.offers.slice(0, RFQ_BOARD_CAP);
        const note = [
          "Annual cost = volume × unit price; prices exclude freight, duties and tooling.",
          r.callOff !== null && `MOQ checked against a monthly call-off of ${r.callOff.toLocaleString("en-GB")}.`,
          `Source: ${r.source === "live" ? "data service (run_sql)" : "brake dataset CSVs"}.`,
        ]
          .filter(Boolean)
          .join(" ");
        const prospects = r.dual ? [r.dual.primary, r.dual.secondary].filter((s) => s?.prospect) : [];
        return (
          <BlockFrame block="rfq-board" title={heading} note={note}>
            <div className="mb-3 flex flex-wrap gap-2">
              {r.chips.map((c) => (
                <span key={c} className="inline-flex h-7 items-center rounded-full border border-line px-3 text-sm text-ink">
                  {c}
                </span>
              ))}
            </div>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-subtle">
                    {COLUMNS.map((c, i) => (
                      <th key={c} scope="col" className={cn("whitespace-nowrap px-4 py-2 font-medium text-subtext", i === 1 || i === 2 || i === 5 ? "text-right" : "text-left")}>
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((o) => (
                    <tr key={o.id} className={cn("transition-colors hover:bg-hover", !o.qualified && "text-subtext")}>
                      <td className="max-w-56 px-4 py-2">
                        <span className="flex min-w-0 items-center gap-1">
                          <SupplierLink id={o.id} className={cn("min-w-0 truncate", !o.qualified && "text-subtext")}>
                            {o.name}
                          </SupplierLink>
                          {o.prospect && <span className="shrink-0 text-subtext">· Prospect</span>}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Num>{eur2(o.price)}</Num>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">{o.qualified ? <Num>{eur0(o.annual)}</Num> : <span className="text-tertiary">–</span>}</td>
                      <td className="max-w-64 px-4 py-2">
                        {o.qualified ? (
                          <span className="inline-flex items-center gap-1.5 text-ink">
                            <Dot fill={PASS} />
                            Qualified
                          </span>
                        ) : (
                          <span className="block truncate" title={o.failed.join("; ")}>
                            {o.failed.join("; ")}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-ink">
                        <GateCell o={o} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-right">
                        <span className="inline-flex items-center justify-end gap-1.5">
                          {o.qualified && !o.moqFits && <Dot fill={FAIL} label="MOQ above the monthly call-off" />}
                          <Num>{o.moq === null ? "–" : o.moq.toLocaleString("en-GB")}</Num>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {r.offers.length > RFQ_BOARD_CAP && <MoreButton onClick={() => setAll((v) => !v)}>{all ? "Show fewer" : `Show all ${r.offers.length}`}</MoreButton>}

            {r.award && (
              <div className="mt-4 rounded-lg border border-line px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="text-base font-semibold text-ink">
                    Award <SupplierLink id={r.award.id}>{r.award.name}</SupplierLink>
                    {r.award.prospect && <span className="font-normal text-subtext"> · Prospect</span>}
                  </span>
                  <Num className="text-ink">
                    EUR {eur2(r.award.price)} · {eur0(r.award.annual)} / yr
                  </Num>
                </div>
                {r.gateCost !== null && r.gateCost > 0 && r.cheapestId && (
                  <p className="mt-1 text-subtext">
                    The risk gate costs <Num className="text-ink">{eur0(r.gateCost)}</Num> a year over the cheapest qualified offer.
                  </p>
                )}
              </div>
            )}

            {r.dual?.primary && r.dual.secondary && (
              <div className="mt-4 space-y-2 border-t border-subtle pt-4">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-medium text-ink">
                    Dual source {r.dual.primary.pct}/{r.dual.secondary.pct}
                  </span>
                  <Num className="text-ink">
                    {eur0(r.dual.total)} / yr{r.dual.extra !== null && r.dual.extra > 0 ? ` (+${eur0(r.dual.extra)} vs single)` : ""}
                  </Num>
                </div>
                <SplitBar primary={r.dual.primary} secondary={r.dual.secondary} />
                {prospects.length > 0 && <p className="text-subtext">{prospects.map((s) => s!.name).join(" and ")} must be onboarded first (no order history).</p>}
              </div>
            )}
          </BlockFrame>
        );
      }}
    </WithResult>
  );
}

export const RfqBoardBlock: ComponentRenderer<BlockProps<"RfqBoard">> = ({ props }) => <RfqBoardView resultId={props.resultId} title={props.title} />;
