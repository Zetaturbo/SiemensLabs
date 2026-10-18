"use client";
import { createContext, useContext, useSyncExternalStore } from "react";
import type { Stage } from "@/lib/cases/types";

/**
 * One palette for chrome and canvas. The DOM uses the CSS variables from globals.css directly
 * (STAGE_CSS etc.); three.js needs concrete colours, so readPalette() resolves the same variables
 * with getComputedStyle at mount and derives the stage ramp the same way color-mix does in CSS.
 */

/** Stage colours for DOM elements: grey, blue brightening towards finalists, green when awarded. */
export const STAGE_CSS: Record<Stage, string> = {
  none: "var(--bp-stage-none)",
  long_list: "color-mix(in srgb, var(--bp-stage-progress) 62%, var(--bp-bg))",
  shortlist: "var(--bp-stage-progress)",
  finalists: "color-mix(in srgb, var(--bp-stage-progress) 50%, var(--bp-text))",
  awarded: "var(--bp-stage-awarded)",
};
export const FLAG_CSS = "var(--bp-flag)";
export const GHOST_CSS = "var(--bp-line-dim)";

export interface Rgba {
  hex: string;
  alpha: number;
}

export interface BlueprintPalette {
  theme: "light" | "dark";
  bg: string;
  grid: string;
  gridSection: string;
  line: string;
  lineDim: string;
  lineDimAlpha: number;
  fill: string;
  fillAlpha: number;
  text: string;
  flag: string;
  shadow: string;
  shadowAlpha: number;
  rim: string;
  rimAlpha: number;
  stage: Record<Stage, string>;
}

/** Parse sentinel for a missing variable (not a design colour). */
const UNRESOLVED = "#000000";

/** Normalizes any CSS colour (hex, rgb[a], color-mix, named) to #rrggbb plus alpha via a 2D canvas. */
function resolve(css: string, ctx: CanvasRenderingContext2D | null): Rgba {
  if (!ctx || !css) return { hex: UNRESOLVED, alpha: 0 };
  ctx.fillStyle = "transparent";
  ctx.fillStyle = css;
  const v = String(ctx.fillStyle);
  if (v.startsWith("#")) return { hex: v, alpha: 1 };
  const m = v.match(/rgba?\(([^)]+)\)/);
  if (!m) return { hex: UNRESOLVED, alpha: 0 };
  const [r, g, b, a] = m[1].split(",").map((x) => parseFloat(x));
  const hex = `#${[r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("")}`;
  return { hex, alpha: Number.isFinite(a) ? a : 1 };
}

/** Linear blend of two #rrggbb colours (t = 0 gives a, 1 gives b). */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number) => Math.round(((pa >> shift) & 255) * (1 - t) + ((pb >> shift) & 255) * t);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

export function readPalette(): BlueprintPalette {
  const style = getComputedStyle(document.documentElement);
  const ctx = document.createElement("canvas").getContext("2d");
  const v = (name: string) => resolve(style.getPropertyValue(name).trim(), ctx);
  const bg = v("--bp-bg").hex;
  const text = v("--bp-text").hex;
  const progress = v("--bp-stage-progress").hex;
  const grid = v("--bp-grid");
  const dim = v("--bp-line-dim");
  const fill = v("--bp-fill");
  const shadow = v("--bp-shadow");
  const rim = v("--bp-rim");
  return {
    theme: document.documentElement.dataset.theme === "dark" ? "dark" : "light",
    bg,
    // the grid variable is translucent; pre-blend it on the background since the grid shader has no alpha
    grid: mix(bg, grid.hex, grid.alpha),
    gridSection: mix(bg, grid.hex, Math.min(1, grid.alpha * 2.4)),
    line: v("--bp-line").hex,
    lineDim: dim.hex,
    lineDimAlpha: dim.alpha,
    fill: fill.hex,
    fillAlpha: fill.alpha,
    text,
    flag: v("--bp-flag").hex,
    shadow: shadow.hex,
    shadowAlpha: shadow.alpha,
    rim: rim.hex,
    rimAlpha: rim.alpha,
    stage: {
      none: v("--bp-stage-none").hex,
      long_list: mix(progress, bg, 0.38),
      shortlist: progress,
      finalists: mix(progress, text, 0.5),
      awarded: v("--bp-stage-awarded").hex,
    },
  };
}

const themeKey = () => document.documentElement.dataset.theme ?? "light";
let cached: { key: string; palette: BlueprintPalette } | null = null;

function subscribeTheme(cb: () => void) {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-appearance"] });
  return () => obs.disconnect();
}

function snapshot(): BlueprintPalette {
  const key = `${themeKey()}/${document.documentElement.dataset.appearance ?? ""}`;
  if (!cached || cached.key !== key) cached = { key, palette: readPalette() };
  return cached.palette;
}

/** The palette for the current theme; canvases re-render with the new colours when the theme changes. */
export function useBlueprintPalette(): BlueprintPalette {
  return useSyncExternalStore(subscribeTheme, snapshot, snapshot);
}

export const PaletteContext = createContext<BlueprintPalette | null>(null);

export function usePalette(): BlueprintPalette {
  const p = useContext(PaletteContext);
  if (!p) throw new Error("usePalette outside the train canvas");
  return p;
}
