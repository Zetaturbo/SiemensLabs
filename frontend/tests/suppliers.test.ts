import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";
import {
  comparisonMetrics,
  getBestSupplierIds,
  getPreliminaryResults,
  parseSupplierCsv,
  searchSuppliers,
  updateShortlist,
} from "../lib/suppliers";

const dataset = parseSupplierCsv(
  readFileSync(resolve(process.cwd(), "../../dataset.csv"), "utf8"),
);

describe("supplier comparison using the provided dataset.csv", () => {
  it("loads all 10,000 real suppliers and preserves known record values", () => {
    assert.equal(dataset.length, 10_000);
    const supplier = dataset.find((entry) => entry.id === "SUPP_00001");
    assert.ok(supplier);
    assert.deepEqual(
      {
        name: supplier.name,
        totalRiskIndex: supplier.totalRiskIndex,
        financialHealthRisk: supplier.financialHealthRisk,
        deliveryRating: supplier.deliveryRating,
      },
      {
        name: "Apex Technologies 491",
        totalRiskIndex: 68,
        financialHealthRisk: 96,
        deliveryRating: 84.27,
      },
    );
  });

  it("ranks a maximum of 20 preliminary results by the lowest total risk", () => {
    const results = getPreliminaryResults(dataset, 100);
    assert.equal(results.length, 20);
    assert.deepEqual(
      results.map((supplier) => supplier.totalRiskIndex),
      [...results].map((supplier) => supplier.totalRiskIndex).sort((left, right) => left - right),
    );
    assert.equal(
      results[0].totalRiskIndex,
      Math.min(...dataset.map((supplier) => supplier.totalRiskIndex)),
    );
  });

  it("searches supplier IDs and names across the full real dataset", () => {
    assert.equal(searchSuppliers(dataset, "SUPP_00018").length, 1);
    assert.equal(searchSuppliers(dataset, "SUPP_00018")[0].id, "SUPP_00018");
    assert.equal(
      searchSuppliers(dataset, "Apex Technologies 491")[0].id,
      "SUPP_00001",
    );
  });

  it("enforces the 20-supplier cap and still allows removing a selected supplier", () => {
    const twentyIds = dataset.slice(0, 20).map((supplier) => supplier.id);
    assert.deepEqual(updateShortlist(twentyIds, dataset[20].id), {
      ids: twentyIds,
      limitReached: true,
    });
    assert.deepEqual(updateShortlist(twentyIds, twentyIds[0]), {
      ids: twentyIds.slice(1),
      limitReached: false,
    });
  });

  it("highlights the best values using each metric's direction", () => {
    const shortlist = getPreliminaryResults(dataset, 5);
    const riskMetric = comparisonMetrics.find((metric) => metric.key === "totalRiskIndex");
    const deliveryMetric = comparisonMetrics.find((metric) => metric.key === "deliveryRating");
    assert.ok(riskMetric);
    assert.ok(deliveryMetric);
    const lowestRisk = Math.min(...shortlist.map((supplier) => supplier.totalRiskIndex));
    const highestDelivery = Math.max(...shortlist.map((supplier) => supplier.deliveryRating));
    assert.deepEqual(getBestSupplierIds(shortlist, riskMetric), 
      new Set(shortlist.filter((supplier) => supplier.totalRiskIndex === lowestRisk).map((supplier) => supplier.id)),
    );
    assert.deepEqual(getBestSupplierIds(shortlist, deliveryMetric),
      new Set(shortlist.filter((supplier) => supplier.deliveryRating === highestDelivery).map((supplier) => supplier.id)),
    );
  });

  it("parses commas and escaped quotes in quoted CSV fields", () => {
    const [supplier] = parseSupplierCsv(
      'supplierID,Supplier Name,Total_Risk_Index,Total_Risk_Index_Level,Quality_Risk_Score,Quality_Risk_Score_Level,Financial_Health_Score,Financial_Health_Score_Level,Compliance_Risk_Score,Compliance_Risk_Score_Level,Operational_Resilience_Score,Operational_Resilience_Score_Level,Supplier Delivery Rating,Order Confirmation Rate,Order Change Rate,Purchase Order Volume (EUR),Sourcing Risk Level,Supply Chain Complexity\nSUPP_TEST,"A, ""quoted"" Supplier",10,Low,10,Low,10,Low,10,Low,10,Low,90,90,2,1000,Low,Simple',
    );
    assert.equal(supplier.name, 'A, "quoted" Supplier');
  });
});
