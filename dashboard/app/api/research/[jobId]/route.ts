import { NextResponse } from "next/server";
import { getResearchJob, ResearchError } from "@/lib/research";

export const runtime = "nodejs";

// Status of a research job, with the report once it is done. The dashboard polls this.
export async function GET(_request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  try {
    return NextResponse.json(await getResearchJob(jobId));
  } catch (error) {
    if (error instanceof ResearchError) {
      return NextResponse.json({ error: error.message }, { status: error.code === "NOT_FOUND" ? 404 : 502 });
    }
    return NextResponse.json({ error: "Could not load research status." }, { status: 502 });
  }
}
