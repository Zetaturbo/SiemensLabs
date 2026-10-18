import type { ReactNode } from "react";

/**
 * Former per-page frame. The sidebar and top bar now come from the root layout (AppFrame), so this only
 * keeps the content width: full-bleed screens (train map, case screen) get the whole content area, other
 * pages a padded column. Kept so existing routes compile unchanged; new pages use PageBody.
 */
export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  if (fullBleed) return <>{children}</>;
  return <div className="mx-auto w-full max-w-6xl px-6 py-8">{children}</div>;
}
