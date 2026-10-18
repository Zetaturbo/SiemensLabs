import { Suspense } from "react";
import type { Metadata } from "next";
import { SuppliersBoard } from "@/components/shell/pages/suppliers-board";
import { SupplierComparison } from "@/components/shell/pages/supplier-comparison";
import { getBrakeSuppliers } from "@/lib/brake-suppliers/data";

export const metadata: Metadata = { title: "Suppliers · Supplier Risk Intelligence" };

/**
 * The classic working view on a sourcing case (case picker, candidates, shortlist comparison, Continue), the backup
 * to the case chat. The board reads `?case=` with useSearchParams, so it renders inside a Suspense boundary.
 * Below it: the real brake manufacturers (real names, simulated scores) with the teammate's comparison.
 */
export default async function SuppliersPage() {
  const brakeSuppliers = await getBrakeSuppliers();
  return (
    <div className="flex flex-col">
      <div className="min-h-full">
        <Suspense fallback={<div className="h-full bg-canvas" />}>
          <SuppliersBoard />
        </Suspense>
      </div>
      <section className="border-t border-border px-8 pb-10 pt-8">
        <h2 className="mb-1 text-base font-medium text-ink">Real brake manufacturers</h2>
        <p className="mb-6 text-sm text-subtext">Real names, simulated scores. Research runs against the real company.</p>
        <SupplierComparison suppliers={brakeSuppliers} />
      </section>
    </div>
  );
}
