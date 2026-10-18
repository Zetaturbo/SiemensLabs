"use client";
import { useSyncExternalStore } from "react";
import { create } from "zustand";

/**
 * Shell UI state. The sidebar width and the theme live on <html> as data attributes, set before paint by
 * the inline script in app/layout.tsx from localStorage, so a reload never flashes the wrong layout.
 * Components read them through useSyncExternalStore; writers update the attribute and storage together.
 */

export const SIDEBAR_KEY = "sri.sidebar";
export const THEME_KEY = "sri.theme";

export type ThemeSetting = "light" | "dark" | "system";

function htmlAttr(name: string) {
  const subscribe = (cb: () => void) => {
    const obs = new MutationObserver(cb);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: [name] });
    return () => obs.disconnect();
  };
  return subscribe;
}

const subscribeSidebar = htmlAttr("data-sidebar");
const getCollapsed = () => document.documentElement.dataset.sidebar === "collapsed";

export function useSidebarCollapsed(): boolean {
  return useSyncExternalStore(subscribeSidebar, getCollapsed, () => false);
}

export function setSidebarCollapsed(collapsed: boolean) {
  document.documentElement.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "expanded");
  } catch {}
}

export const toggleSidebar = () => setSidebarCollapsed(!getCollapsed());

const subscribeTheme = htmlAttr("data-theme-setting");
const getThemeSetting = (): ThemeSetting => {
  const v = document.documentElement.dataset.themeSetting;
  return v === "dark" || v === "system" ? v : "light";
};

export function useThemeSetting(): ThemeSetting {
  return useSyncExternalStore(subscribeTheme, getThemeSetting, () => "light");
}

const prefersDark = () => typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches;

/** Apply a theme setting: resolves "system" against the OS, writes the attributes and storage. */
export function setThemeSetting(setting: ThemeSetting) {
  const dark = setting === "dark" || (setting === "system" && prefersDark());
  const el = document.documentElement;
  el.dataset.themeSetting = setting;
  el.dataset.theme = dark ? "dark" : "light";
  el.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(THEME_KEY, setting);
  } catch {}
}

/** Follow OS changes while the setting is "system". Returns the cleanup. */
export function followSystemTheme(): () => void {
  if (typeof matchMedia !== "function") return () => {};
  const mq = matchMedia("(prefers-color-scheme: dark)");
  const on = () => {
    if (getThemeSetting() === "system") setThemeSetting("system");
  };
  mq.addEventListener("change", on);
  return () => mq.removeEventListener("change", on);
}

/** Dialogs the shell owns; any component can open them. */
interface ShellDialogs {
  palette: boolean;
  shortcuts: boolean;
  setPalette: (open: boolean) => void;
  setShortcuts: (open: boolean) => void;
}

export const useShellDialogs = create<ShellDialogs>((set) => ({
  palette: false,
  shortcuts: false,
  setPalette: (palette) => set({ palette, shortcuts: false }),
  setShortcuts: (shortcuts) => set({ shortcuts, palette: false }),
}));

/** True when the key event comes from a text field (shortcuts must not fire while typing). */
export function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
}

/** "⌘" on Apple platforms, "Ctrl" elsewhere (client only; SSR renders "Ctrl"). */
const getMod = () => (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent) ? "⌘" : "Ctrl");
export function useModKey(): string {
  return useSyncExternalStore(
    () => () => {},
    getMod,
    () => "Ctrl",
  );
}
