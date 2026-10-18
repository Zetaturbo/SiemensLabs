"use client";
import { useEffect, type ReactNode } from "react";
import { ToastProvider } from "@/design-system/react";
import { startCasePersistence } from "@/lib/cases/actions";
import { CommandPalette } from "./command-palette";
import { followSystemTheme, isTyping, toggleSidebar, useShellDialogs } from "./shell-state";
import { ShortcutsDialog } from "./shortcuts-dialog";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

/**
 * The SaaS frame around every route (rendered by app/layout.tsx): sidebar, then a column with the
 * 48 px top bar and <main>. The viewport never scrolls; <main> is the only scroll container, and its
 * height is exactly 100dvh - 3rem, so full-height screens (train map, case screen) fill it without a
 * scroll bar.
 */
export function AppFrame({ children }: { children: ReactNode }) {
  useEffect(() => {
    startCasePersistence();
    const stopTheme = followSystemTheme();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const k = e.key.toLowerCase();
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && k === "k") {
        e.preventDefault();
        const { palette, setPalette } = useShellDialogs.getState();
        setPalette(!palette);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      if (e.key === "[") {
        e.preventDefault();
        toggleSidebar();
      } else if (e.key === "?") {
        e.preventDefault();
        useShellDialogs.getState().setShortcuts(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      stopTheme();
    };
  }, []);

  return (
    <ToastProvider>
      <a
        href="#main"
        className="sr-only z-[130] rounded-lg bg-surface px-3 py-2 text-base text-ink shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <div className="flex h-dvh w-full overflow-hidden bg-canvas text-ink">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main id="main" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden outline-none">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
    </ToastProvider>
  );
}
