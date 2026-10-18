import { Suspense } from "react";
import type { Metadata } from "next";
import { CaseScreenFallback } from "@/components/case/case-screen";
import trainParts from "@/config/train-parts.json";

const PART_LABEL: Record<string, string> = Object.fromEntries((trainParts as { parts: Array<{ id: string; label: string }> }).parts.map((p) => [p.id, p.label]));

/** Tab title per case: "Brake system · Cases" (the part's label; the raw id for an unknown case). */
export async function generateMetadata({ params }: LayoutProps<"/cases/[caseId]">): Promise<Metadata> {
  const caseId = decodeURIComponent((await params).caseId);
  const label = PART_LABEL[caseId.replace(/^case_/, "")] ?? caseId;
  return { title: `${label} · Cases` };
}

/**
 * Case frame inside the app frame (sidebar and top bar come from the root layout; <main> is the scroll
 * container with a fixed height, and the case screen fills it with h-full). Case state lives in the client
 * store (src/lib/cases), so the screen is a client component that reads the id with useParams; the Suspense
 * boundary keeps the prerendered frame static under cacheComponents while the dynamic id resolves.
 */
export default function CaseLayout({ children }: LayoutProps<"/cases/[caseId]">) {
  return <Suspense fallback={<CaseScreenFallback />}>{children}</Suspense>;
}
