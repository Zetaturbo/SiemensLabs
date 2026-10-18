"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/design-system/react";

type Mode = "light" | "dark";

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const getSnapshot = (): Mode => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = (): Mode => "light";

export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("sri.theme", next);
    } catch {}
  };
  return (
    <IconButton aria-label="Toggle theme" onClick={toggle} variant="ghost">
      {mode === "dark" ? <Sun /> : <Moon />}
    </IconButton>
  );
}
