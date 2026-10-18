"use client";
import { useSyncExternalStore } from "react";
import type { Level } from "./domain";

// Palette from the dataviz reference instance: categorical slots 1-3 (validated all-pairs in both
// modes, so radar overlays stay at three series), the fixed status palette for risk levels and the
// blue/red diverging pair for contributions vs the dataset mean.

const LIGHT = {
  surface: "#ffffff",
  grid: "#e7e5e4",
  axis: "#78716c",
  text: "#1c1917",
  textMuted: "#57534e",
  series: ["#2a78d6", "#eb6834", "#1baf7a"],
  accent: "#2a78d6",
  highlight: "#eb6834",
  increase: "#e34948", // raises risk
  decrease: "#2a78d6", // lowers risk
  neutral: "#a8a29e",
};

const DARK: typeof LIGHT = {
  surface: "#18181b",
  grid: "#3f3f46",
  axis: "#a1a1aa",
  text: "#f4f4f5",
  textMuted: "#c3c2b7",
  series: ["#3987e5", "#d95926", "#199e70"],
  accent: "#3987e5",
  highlight: "#d95926",
  increase: "#e66767",
  decrease: "#3987e5",
  neutral: "#71717a",
};

export const LEVEL_HEX: Record<Level, string> = { Low: "#0ca30c", Medium: "#fab219", High: "#ec835a", Critical: "#d03b3b" };

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useChartTheme() {
  const dark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
    () => false,
  );
  return dark ? DARK : LIGHT;
}

export type ChartTheme = ReturnType<typeof useChartTheme>;
