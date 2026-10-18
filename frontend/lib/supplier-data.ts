import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSupplierCsv, searchSuppliers, type Supplier } from "@/lib/suppliers";

const supplierFiles = [
  "../data/eval/source/supplier_risk_data.csv",
  // Real brake manufacturers with simulated scores, pending research enrichment
  "../data/brakes/source/real_brake_suppliers.csv",
];

let supplierData: Promise<Supplier[]> | undefined;

export function getSupplierData(): Promise<Supplier[]> {
  supplierData ??= Promise.all(
    supplierFiles.map((file) =>
      readFile(resolve(process.cwd(), file), "utf8").then(parseSupplierCsv),
    ),
  ).then((datasets) => datasets.flat());
  return supplierData;
}

export async function findSuppliers(query: string, limit = 20): Promise<Supplier[]> {
  return searchSuppliers(await getSupplierData(), query, limit);
}
