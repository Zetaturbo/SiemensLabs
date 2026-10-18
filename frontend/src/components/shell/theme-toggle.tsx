"use client";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { IconButton } from "@/design-system/react";

type Mode = "light" | "dark";

export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>("light");
  useEffect(() => {
    setMode((document.documentElement.dataset.theme as Mode) ?? "light");
  }, []);
  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    document.documentElement.style.colorScheme = next;
    try {
      localStorage.setItem("sri.theme", next);
    } catch {}
    setMode(next);
  };
  return (
    <IconButton aria-label="Toggle theme" onClick={toggle} variant="ghost">
      {mode === "dark" ? <Sun /> : <Moon />}
    </IconButton>
  );
}
