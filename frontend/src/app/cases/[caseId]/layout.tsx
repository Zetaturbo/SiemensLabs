import { Suspense } from "react";
import { CaseShell, CaseShellFallback } from "@/components/case/case-shell";

/**
 * Case frame. Case state lives in the client store (src/lib/cases), so the shell is a client
 * component that reads the id with useParams; the Suspense boundary keeps the prerendered App Shell
 * static under cacheComponents while the dynamic id resolves.
 */
export default function CaseLayout({ children }: LayoutProps<"/cases/[caseId]">) {
  return (
    <Suspense fallback={<CaseShellFallback />}>
      <CaseShell>{children}</CaseShell>
    </Suspense>
  );
}
