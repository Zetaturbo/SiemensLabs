import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseSupplierCsv, type Supplier } from "./suppliers";

// Real brake manufacturers (real names, simulated scores). BRAKE_SUPPLIERS_CSV overrides the path.
const CSV_PATH = process.env.BRAKE_SUPPLIERS_CSV ?? path.join(process.cwd(), "../data/brakes/source/real_brake_suppliers.csv");

let cache: Promise<Supplier[]> | undefined;

export function getBrakeSuppliers(): Promise<Supplier[]> {
  cache ??= readFile(CSV_PATH, "utf8").then(parseSupplierCsv);
  return cache;
}
