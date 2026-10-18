import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseSupplierCsv, searchSuppliers, type Supplier } from "@/lib/suppliers";

let supplierData: Promise<Supplier[]> | undefined;

export function getSupplierData(): Promise<Supplier[]> {
  supplierData ??= readFile(
    resolve(process.cwd(), "../data/eval/source/supplier_risk_data.csv"),
    "utf8",
  ).then(parseSupplierCsv);
  return supplierData;
}

export async function findSuppliers(query: string, limit = 20): Promise<Supplier[]> {
  return searchSuppliers(await getSupplierData(), query, limit);
}
