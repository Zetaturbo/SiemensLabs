import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

/** Top bar + content column. Pages that need full-bleed (the train map) pass `fullBleed`. */
export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-4 border-b border-line bg-surface/80 px-4 backdrop-blur-xl">
        <Link href="/" className="text-sm font-semibold tracking-[-0.02em] text-ink">
          Supplier Risk Intelligence
        </Link>
        <nav className="flex items-center gap-1 text-sm text-subtext">
          <Link href="/train" className="rounded-md px-2 py-1 hover:bg-hover hover:text-ink">Train map</Link>
          <Link href="/cases/case_brake_system" className="rounded-md px-2 py-1 hover:bg-hover hover:text-ink">Brake system case</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
        </div>
      </header>
      <main className={fullBleed ? "flex-1" : "mx-auto w-full max-w-6xl flex-1 px-6 py-8"}>{children}</main>
    </div>
  );
}
