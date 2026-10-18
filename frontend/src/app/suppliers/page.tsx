import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page";
import { SupplierComparison } from "@/components/shell/pages/supplier-comparison";
import { SuppliersOverview } from "@/components/shell/pages/suppliers-overview";
import { getBrakeSuppliers } from "@/lib/brake-suppliers/data";

export const metadata: Metadata = { title: "Suppliers · Supplier Risk Intelligence" };

export default async function SuppliersPage() {
  const brakeSuppliers = await getBrakeSuppliers();
  return (
    <PageBody>
      <PageHeader title="Suppliers" context="The supplier risk dataset behind every case." />
      <div className="flex flex-col gap-10">
        <SuppliersOverview />
        <SupplierComparison suppliers={brakeSuppliers} />
      </div>
    </PageBody>
  );
}
