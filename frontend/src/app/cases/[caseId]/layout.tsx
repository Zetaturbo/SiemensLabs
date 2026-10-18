import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CaseScreenFallback } from "@/components/case/case-screen";

/**
 * Case frame inside the app shell. Case state lives in the client store (src/lib/cases), so the
 * screen is a client component that reads the id with useParams; the Suspense boundary keeps the
 * prerendered App Shell static under cacheComponents while the dynamic id resolves.
 * The former stage views (explorer, shortlist board, finalists, memo) are no longer routed; the chat replaces them.
 */
export default function CaseLayout({ children }: LayoutProps<"/cases/[caseId]">) {
  return (
    <AppShell fullBleed>
      <Suspense fallback={<CaseScreenFallback />}>{children}</Suspense>
    </AppShell>
  );
}
