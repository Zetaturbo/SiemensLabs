"use client";
import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton, Tooltip } from "@/design-system/react";
import { setThemeSetting } from "./shell-state";

type Mode = "light" | "dark";

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const getSnapshot = (): Mode => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const getServerSnapshot = (): Mode => "light";

/** Flips between light and dark (an explicit choice; "system" is set from the account menu). */
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const label = mode === "dark" ? "Light theme" : "Dark theme";
  return (
    <Tooltip label={label} side="bottom" className="left-auto right-0 translate-x-0">
      <IconButton aria-label={label} onClick={() => setThemeSetting(mode === "dark" ? "light" : "dark")} variant="ghost" size="sm">
        {mode === "dark" ? <Sun /> : <Moon />}
      </IconButton>
    </Tooltip>
  );
}
