/**
 * pnpm tsx evals/answers/check-brake-math.ts  -  checks the deterministic RFQ math of the brake skills
 * (src/skills/brake-rfq.ts, the same functions find_offerings and qualify_for_rfq run) against the ground truth
 * of the scenario items in data/brakes/brake_procurement_eval_v1.jsonl and data/brakes/demo/rfq02_demo_v1.jsonl,
 * without a model. Exits 1 on any mismatch.
 */
import Module from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";

const loader = Module as unknown as { _resolveFilename: (request: string, ...rest: unknown[]) => string };
const resolveFilename = loader._resolveFilename;
loader._resolveFilename = function (request: string, ...rest: unknown[]) {
  return resolveFilename.call(this, request === "server-only" ? "next/dist/compiled/server-only/empty.js" : request, ...rest);
};
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
process.chdir(ROOT);

/** The six RFQ scenarios of data/brakes/scripts/generate_brake_procurement_eval.py, plus the demo (same as RFQ-02). */
const SCENARIOS: Record<string, { product: string; volume: number; certs: string[]; copper_free: boolean; max_lead: number; region: string | null }> = {
  "RFQ-01": { product: "Disc brake pads", volume: 1_500_000, certs: ["IATF 16949", "ECE R90"], copper_free: true, max_lead: 50, region: null },
  "RFQ-02": { product: "Rail brake pads", volume: 30_000, certs: ["ISO/TS 22163"], copper_free: false, max_lead: 90, region: null },
  "RFQ-03": { product: "Yaw brake pads", volume: 15_000, certs: ["ISO 14001"], copper_free: false, max_lead: 90, region: "EU" },
  "RFQ-04": { product: "Spring-applied brakes", volume: 10_000, certs: ["ISO 9001", "ISO 14001"], copper_free: false, max_lead: 75, region: null },
  "RFQ-05": { product: "Air disc brake pads", volume: 400_000, certs: ["IATF 16949"], copper_free: false, max_lead: 50, region: null },
  "RFQ-06": { product: "Brake discs", volume: 1_000_000, certs: ["IATF 16949", "ECE R90"], copper_free: false, max_lead: 45, region: null },
};
SCENARIOS["RFQ-02-DEMO"] = SCENARIOS["RFQ-02"];

interface Item {
  id: string;
  category: string;
  scenario_id?: string;
  question: string;
  expected: Record<string, unknown>;
  supplier_ids?: string[];
}

async function main() {
  const { loadBrakeData } = await import("@/lib/data-api/brakes");
  const { filterOfferings, qualifyRfq } = await import("@/skills/brake-rfq");
  const { rows } = await loadBrakeData();
  const items: Item[] = ["../data/brakes/brake_procurement_eval_v1.jsonl", "../data/brakes/demo/rfq02_demo_v1.jsonl"].flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as Item),
  );
  let checked = 0;
  const bad: string[] = [];
  const near = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.006;
  const same = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  for (const it of items) {
    const sc = it.scenario_id ? SCENARIOS[it.scenario_id] : undefined;
    if (!sc) continue;
    const approvedOnly = /approved supplier should we award|onboarding a new supplier is not possible/i.test(it.question);
    const spec = {
      product_type: sc.product,
      annual_volume: sc.volume,
      certifications: sc.certs,
      copper_free: sc.copper_free,
      max_lead_time_days: sc.max_lead,
      min_annual_capacity: sc.volume,
      region: sc.region,
      approved_only: approvedOnly,
      risk_gate: true,
      max_total_risk_index: 50,
      max_financial_health: 50,
      primary_share: 70,
      monthly_call_off: Math.floor(sc.volume / 12),
    };
    const r = qualifyRfq(rows, spec);
    const e = it.expected;
    let ok: boolean | null = null;
    let got: unknown = null;
    switch (it.category) {
      case "supplier_discovery":
        got = filterOfferings(rows, { product_type: sc.product }).map((o) => o.supplier_id);
        ok = same(got as string[], e.ids as string[]);
        break;
      case "qualification":
        got = r.qualified_ids;
        ok = same(r.qualified_ids, e.ids as string[]);
        break;
      case "disqualification_reason": {
        const id = it.supplier_ids?.[0];
        got = r.offers.find((o) => o.supplier_id === id)?.failed ?? [];
        ok = same(got as string[], e.failed_criteria as string[]);
        break;
      }
      case "price_comparison":
        got = [r.cheapest_qualified?.supplier_id, r.cheapest_qualified?.unit_price_eur];
        ok = r.cheapest_qualified?.supplier_id === e.answer_id && (near(r.cheapest_qualified?.unit_price_eur, e.value) || near(r.cheapest_qualified?.annual_cost_eur, e.value));
        break;
      case "risk_gate":
        got = r.gate_failures.map((o) => o.supplier_id);
        ok = same(got as string[], e.ids as string[]);
        break;
      case "award_recommendation":
        got = [r.award?.supplier_id, r.award?.unit_price_eur, r.award?.annual_cost_eur];
        ok = r.award?.supplier_id === e.answer_id && (near(r.award?.unit_price_eur, e.value) || near(r.award?.annual_cost_eur, e.value));
        break;
      case "cost_calculation": {
        const all = [r.gate_cost_eur, ...r.offers.map((o) => o.annual_cost_eur)];
        got = e.value;
        ok = all.some((v) => near(v, e.value));
        break;
      }
      case "dual_sourcing":
        got = [r.dual?.primary.supplier_id, r.dual?.secondary.supplier_id, r.dual?.total_eur];
        ok = near(r.dual?.total_eur, e.value) && (!e.ids_ordered || JSON.stringify([r.dual?.primary.supplier_id, r.dual?.secondary.supplier_id]) === JSON.stringify(e.ids_ordered));
        break;
      case "moq_check": {
        const id = it.supplier_ids?.[0];
        const o = r.offers.find((x) => x.supplier_id === id);
        got = [o?.moq_units, o?.moq_fits];
        ok = o?.moq_units === e.moq && (o?.moq_fits ? "Yes" : "No") === e.value;
        break;
      }
      default:
        continue;
    }
    checked++;
    if (!ok) bad.push(`${it.id} ${it.category}: expected ${JSON.stringify(e)}, got ${JSON.stringify(got)}`);
  }
  for (const b of bad) console.log(`MISMATCH ${b}`);
  console.log(`${checked - bad.length}/${checked} scenario items reproduced by the RFQ math`);
  process.exit(bad.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
