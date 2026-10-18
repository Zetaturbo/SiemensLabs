import SupplierComparison from "@/components/supplier-comparison";
import { findSuppliers, getSupplierData } from "@/lib/supplier-data";

export default async function Home() {
  const [candidates, suppliers] = await Promise.all([findSuppliers(""), getSupplierData()]);
  return <SupplierComparison initialCandidates={candidates} totalSuppliers={suppliers.length} />;
}
