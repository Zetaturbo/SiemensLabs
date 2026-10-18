import { NextResponse } from "next/server";
import { ResearchError, startResearch } from "@/lib/research";
import { isResearchable } from "@/lib/research-types";
import { getSupplierData } from "@/lib/supplier-data";

export const runtime = "nodejs";

// Starts a research job for a shortlisted supplier. The company name and country come from the dataset, not the client.
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { supplierId?: unknown } | null;
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId : "";
  const supplier = (await getSupplierData()).find((entry) => entry.id === supplierId);
  if (!supplier) return NextResponse.json({ error: "Unknown supplier." }, { status: 404 });
  if (!isResearchable(supplier.id)) {
    return NextResponse.json(
      { error: `${supplier.id} has an invented name, so there is nothing to research.` },
      { status: 400 },
    );
  }

  try {
    const job = await startResearch({
      company_name: supplier.name,
      country: supplier.country ?? null,
      supplier_id: supplier.id,
    });
    return NextResponse.json(job);
  } catch (error) {
    const message = error instanceof ResearchError ? error.message : "Could not start research.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
