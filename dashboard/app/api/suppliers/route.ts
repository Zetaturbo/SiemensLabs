import { NextResponse } from "next/server";
import { findSuppliers } from "@/lib/supplier-data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q") ?? "";
  const results = await findSuppliers(query);
  return NextResponse.json({ results });
}
