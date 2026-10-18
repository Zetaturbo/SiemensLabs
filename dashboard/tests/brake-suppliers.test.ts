import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { findSuppliers, getSupplierData } from "../lib/supplier-data";

describe("dashboard supplier data", () => {
  it("loads only the real brake suppliers", async () => {
    const suppliers = await getSupplierData();
    assert.equal(suppliers.length, 12);
    assert.ok(suppliers.every((supplier) => supplier.id.startsWith("BRKR_")));
    assert.equal(new Set(suppliers.map((supplier) => supplier.id)).size, suppliers.length);
  });

  it("finds brake suppliers by ID prefix and by company name", async () => {
    assert.equal((await findSuppliers("BRKR_")).length, 12);
    assert.equal((await findSuppliers("Knorr-Bremse"))[0].id, "BRKR_0002");
    assert.equal((await findSuppliers("Knorr-Bremse"))[0].country, "Germany");
  });
});
