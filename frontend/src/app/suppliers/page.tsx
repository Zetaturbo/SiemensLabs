import { Suspense } from "react";
import type { Metadata } from "next";
import { SuppliersBoard } from "@/components/shell/pages/suppliers-board";

export const metadata: Metadata = { title: "Suppliers · Supplier Risk Intelligence" };

/**
 * The classic working view on a sourcing case (case picker, candidates, shortlist comparison, Continue), the backup
 * to the case chat. The board reads `?case=` with useSearchParams, so it renders inside a Suspense boundary.
 */
export default function SuppliersPage() {
  return (
    <Suspense fallback={<div className="h-full bg-canvas" />}>
      <SuppliersBoard />
    </Suspense>
  );
}
