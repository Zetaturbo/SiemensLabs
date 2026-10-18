import type { Metadata } from "next";
import { PageBody, PageHeader } from "@/components/shell/page";
import { SuppliersOverview } from "@/components/shell/pages/suppliers-overview";

export const metadata: Metadata = { title: "Suppliers · Supplier Risk Intelligence" };

export default function SuppliersPage() {
  return (
    <PageBody width="narrow">
      <PageHeader title="Suppliers" context="The supplier risk dataset behind every case." />
      <SuppliersOverview />
    </PageBody>
  );
}
