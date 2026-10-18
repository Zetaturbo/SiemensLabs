// Ported from dashboard/lib/suppliers.ts: parse real_brake_suppliers.csv, search, shortlist, best value per metric.

export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export type Supplier = {
  id: string;
  name: string;
  totalRiskIndex: number;
  totalRiskLevel: RiskLevel;
  qualityRisk: number;
  qualityRiskLevel: RiskLevel;
  financialHealthRisk: number;
  financialHealthRiskLevel: RiskLevel;
  complianceRisk: number;
  complianceRiskLevel: RiskLevel;
  operationalRisk: number;
  operationalRiskLevel: RiskLevel;
  deliveryRating: number;
  orderConfirmationRate: number;
  orderChangeRate: number;
  purchaseOrderVolumeEur: number;
  sourcingRiskLevel: RiskLevel;
  supplyChainComplexity: "Simple" | "Moderate" | "Complex";
  country?: string;
};

type Metric = {
  key: keyof Supplier;
  label: string;
  group: "Risk score" | "Delivery performance" | "Procurement context";
  better: "lower" | "higher" | null;
  format: "score" | "percent" | "currency" | "level" | "complexity";
};

export const comparisonMetrics: Metric[] = [
  { key: "totalRiskIndex", label: "Total risk index", group: "Risk score", better: "lower", format: "score" },
  { key: "qualityRisk", label: "Quality risk", group: "Risk score", better: "lower", format: "score" },
  { key: "financialHealthRisk", label: "Financial health risk", group: "Risk score", better: "lower", format: "score" },
  { key: "complianceRisk", label: "Compliance risk", group: "Risk score", better: "lower", format: "score" },
  { key: "operationalRisk", label: "Operational resilience risk", group: "Risk score", better: "lower", format: "score" },
  { key: "deliveryRating", label: "Delivery rating", group: "Delivery performance", better: "higher", format: "percent" },
  { key: "orderConfirmationRate", label: "Order confirmation", group: "Delivery performance", better: "higher", format: "percent" },
  { key: "orderChangeRate", label: "Order change rate", group: "Delivery performance", better: "lower", format: "percent" },
  { key: "purchaseOrderVolumeEur", label: "Purchase order volume", group: "Procurement context", better: null, format: "currency" },
  { key: "sourcingRiskLevel", label: "Sourcing risk", group: "Procurement context", better: null, format: "level" },
  { key: "supplyChainComplexity", label: "Supply chain complexity", group: "Procurement context", better: null, format: "complexity" },
];

function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && inQuotes && text[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (character === '"') {
      inQuotes = !inQuotes;
    } else if (character === "," && !inQuotes) {
      record.push(field);
      field = "";
    } else if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      record.push(field);
      if (record.some((value) => value.length > 0)) records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (inQuotes) throw new Error("Supplier CSV contains an unterminated quoted field.");
  if (field.length > 0 || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

function requiredValue(row: Record<string, string>, column: string): string {
  const value = row[column]?.trim();
  if (!value) throw new Error(`Supplier CSV is missing a value in "${column}".`);
  return value;
}

function numberValue(row: Record<string, string>, column: string): number {
  const value = Number(requiredValue(row, column));
  if (!Number.isFinite(value)) throw new Error(`Supplier CSV has an invalid number in "${column}".`);
  return value;
}

function riskLevel(row: Record<string, string>, column: string): RiskLevel {
  const value = requiredValue(row, column);
  if (value === "Low" || value === "Medium" || value === "High" || value === "Critical") return value;
  throw new Error(`Supplier CSV has an unknown risk level in "${column}".`);
}

export function parseSupplierCsv(text: string): Supplier[] {
  const [headers, ...rows] = parseCsvRecords(text.replace(/^\uFEFF/, ""));
  if (!headers || rows.length === 0) throw new Error("Supplier CSV is empty.");

  return rows.map((values) => {
    const row = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
    const complexity = requiredValue(row, "Supply Chain Complexity");
    if (complexity !== "Simple" && complexity !== "Moderate" && complexity !== "Complex") {
      throw new Error('Supplier CSV has an unknown value in "Supply Chain Complexity".');
    }

    return {
      id: requiredValue(row, "supplierID"),
      name: requiredValue(row, "Supplier Name"),
      totalRiskIndex: numberValue(row, "Total_Risk_Index"),
      totalRiskLevel: riskLevel(row, "Total_Risk_Index_Level"),
      qualityRisk: numberValue(row, "Quality_Risk_Score"),
      qualityRiskLevel: riskLevel(row, "Quality_Risk_Score_Level"),
      financialHealthRisk: numberValue(row, "Financial_Health_Score"),
      financialHealthRiskLevel: riskLevel(row, "Financial_Health_Score_Level"),
      complianceRisk: numberValue(row, "Compliance_Risk_Score"),
      complianceRiskLevel: riskLevel(row, "Compliance_Risk_Score_Level"),
      operationalRisk: numberValue(row, "Operational_Resilience_Score"),
      operationalRiskLevel: riskLevel(row, "Operational_Resilience_Score_Level"),
      deliveryRating: numberValue(row, "Supplier Delivery Rating"),
      orderConfirmationRate: numberValue(row, "Order Confirmation Rate"),
      orderChangeRate: numberValue(row, "Order Change Rate"),
      purchaseOrderVolumeEur: numberValue(row, "Purchase Order Volume (EUR)"),
      sourcingRiskLevel: riskLevel(row, "Sourcing Risk Level"),
      supplyChainComplexity: complexity,
      ...(row["Country"]?.trim() ? { country: row["Country"].trim() } : {}),
    };
  });
}

export function getPreliminaryResults(suppliers: Supplier[], limit = 20): Supplier[] {
  return [...suppliers]
    .sort((left, right) => left.totalRiskIndex - right.totalRiskIndex || left.id.localeCompare(right.id))
    .slice(0, Math.min(20, Math.max(0, limit)));
}

export function searchSuppliers(suppliers: Supplier[], query: string, limit = 20): Supplier[] {
  const normalized = query.trim().toLocaleLowerCase();
  const matches = normalized
    ? suppliers.filter((supplier) =>
        `${supplier.id} ${supplier.name}`.toLocaleLowerCase().includes(normalized),
      )
    : suppliers;
  if (!normalized) return getPreliminaryResults(matches, limit);

  const exactMatches = matches.filter(
    (supplier) =>
      supplier.id.toLocaleLowerCase() === normalized ||
      supplier.name.toLocaleLowerCase() === normalized,
  );
  const exactIds = new Set(exactMatches.map((supplier) => supplier.id));
  return [
    ...getPreliminaryResults(exactMatches, limit),
    ...getPreliminaryResults(
      matches.filter((supplier) => !exactIds.has(supplier.id)),
      Math.max(0, limit - exactMatches.length),
    ),
  ];
}

export function updateShortlist(
  selectedIds: string[],
  supplierId: string,
  limit = 20,
): { ids: string[]; limitReached: boolean } {
  if (selectedIds.includes(supplierId)) {
    return { ids: selectedIds.filter((id) => id !== supplierId), limitReached: false };
  }
  if (selectedIds.length >= limit) return { ids: selectedIds, limitReached: true };
  return { ids: [...selectedIds, supplierId], limitReached: false };
}

export function getBestSupplierIds(suppliers: Supplier[], metric: Metric): Set<string> {
  if (!metric.better || suppliers.length === 0) return new Set();
  const values = suppliers.map((supplier) => Number(supplier[metric.key]));
  const bestValue =
    metric.better === "lower" ? Math.min(...values) : Math.max(...values);
  return new Set(
    suppliers
      .filter((supplier) => Number(supplier[metric.key]) === bestValue)
      .map((supplier) => supplier.id),
  );
}

export type { Metric };
