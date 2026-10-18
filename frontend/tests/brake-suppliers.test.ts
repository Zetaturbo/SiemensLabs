import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findSuppliers, getSupplierData } from "../lib/supplier-data";

describe("real brake suppliers loaded alongside the supplier dataset", () => {
  it("loads the 10,000 dataset suppliers plus the real brake suppliers", async () => {
    const suppliers = await getSupplierData();
    const brakeSuppliers = suppliers.filter((supplier) => supplier.id.startsWith("BRKR_"));
    assert.ok(brakeSuppliers.length >= 10);
    assert.equal(suppliers.length, 10_000 + brakeSuppliers.length);
    assert.equal(new Set(suppliers.map((supplier) => supplier.id)).size, suppliers.length);
  });

  it("finds brake suppliers by ID prefix and by company name", async () => {
    assert.equal((await findSuppliers("BRKR_")).length, 12);
    assert.equal((await findSuppliers("Knorr-Bremse"))[0].id, "BRKR_0002");
  });
});
