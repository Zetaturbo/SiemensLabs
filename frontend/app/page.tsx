import SupplierComparison from "@/components/supplier-comparison";
import { findSuppliers } from "@/lib/supplier-data";

export default async function Home() {
  const candidates = await findSuppliers("");
  return <SupplierComparison initialCandidates={candidates} />;
}
