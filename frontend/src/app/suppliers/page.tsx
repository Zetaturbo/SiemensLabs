import { Suspense } from "react";
import type { Metadata } from "next";
import { SuppliersBoard } from "@/components/shell/pages/suppliers-board";
import { SupplierComparison } from "@/components/shell/pages/supplier-comparison";
import { getBrakeSuppliers } from "@/lib/brake-suppliers/data";

export const metadata: Metadata = { title: "Suppliers · Supplier Risk Intelligence" };

/**
 * The classic working view on a sourcing case (case picker, candidates, shortlist comparison, Continue), the backup
 * to the case chat. The board reads `?case=` with useSearchParams, so it renders inside a Suspense boundary.
 * Below it, on the same table and comparison primitives: the real brake manufacturers (real names, simulated scores).
 */
export default async function SuppliersPage() {
  const brakeSuppliers = await getBrakeSuppliers();
  return (
    <div className="flex flex-col bg-canvas">
      <Suspense fallback={<div className="h-dvh bg-canvas" />}>
        <SuppliersBoard />
      </Suspense>
      <SupplierComparison suppliers={brakeSuppliers} />
    </div>
  );
}
