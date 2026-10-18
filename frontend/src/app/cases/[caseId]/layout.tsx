import { Suspense } from "react";
import { AppShell } from "@/components/shell/app-shell";
import { CaseScreenFallback } from "@/components/case/case-screen";

/**
 * Case frame inside the app shell. Case state lives in the client store (src/lib/cases), so the
 * screen is a client component that reads the id with useParams; the Suspense boundary keeps the
 * prerendered App Shell static under cacheComponents while the dynamic id resolves.
 * The case screen fills its container (h-full). This wrapper gives it a definite height under today's shell,
 * whose content area grows with its content; once the shell's content area has a fixed height (brief 09),
 * the wrapper can be `h-full`.
 */
export default function CaseLayout({ children }: LayoutProps<"/cases/[caseId]">) {
  return (
    <AppShell fullBleed>
      <div data-case-frame className="h-[calc(100dvh-3rem)] min-h-[480px]">
        <Suspense fallback={<CaseScreenFallback />}>{children}</Suspense>
      </div>
    </AppShell>
  );
}
