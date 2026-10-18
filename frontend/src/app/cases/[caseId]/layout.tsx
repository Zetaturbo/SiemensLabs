import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CaseShell, CaseShellFallback } from "@/components/case/case-shell";

/**
 * Case frame inside the app shell. Case state lives in the client store (src/lib/cases), so the
 * shell is a client component that reads the id with useParams; the Suspense boundary keeps the
 * prerendered App Shell static under cacheComponents while the dynamic id resolves.
 */
export default function CaseLayout({ children }: LayoutProps<"/cases/[caseId]">) {
  return (
    <AppShell fullBleed>
      <Suspense fallback={<CaseShellFallback />}>
        <CaseShell>{children}</CaseShell>
      </Suspense>
    </AppShell>
  );
}
