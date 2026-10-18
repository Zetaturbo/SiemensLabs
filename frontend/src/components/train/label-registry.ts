"use client";
import type { Vec3 } from "./config";
import { PARTS, type TrainPart } from "./config";

/**
 * Hotspot callouts are plain DOM in one overlay (HotspotLayer) and positioned every frame by
 * LabelProjector inside the canvas. This avoids one React root per label (drei Html) and lets the
 * projector de-overlap labels in screen space.
 */
export interface LabelNodes {
  marker?: HTMLElement | null;
  label?: HTMLElement | null;
  line?: SVGLineElement | null;
  w: number;
  h: number;
  /** Last values written by the projector; reset when a node is (re)registered. */
  cache: Map<string, string>;
}

export const labelNodes = new Map<string, LabelNodes>();

const entry = (id: string): LabelNodes => {
  let e = labelNodes.get(id);
  if (!e) labelNodes.set(id, (e = { w: 120, h: 24, cache: new Map() }));
  return e;
};

const sizeObserver =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((items) => {
        for (const it of items) {
          const id = (it.target as HTMLElement).dataset.part;
          if (!id) continue;
          const e = entry(id);
          e.w = (it.target as HTMLElement).offsetWidth;
          e.h = (it.target as HTMLElement).offsetHeight;
        }
      });

export function registerNode(id: string, kind: "marker" | "label" | "line", el: HTMLElement | SVGLineElement | null) {
  const e = entry(id);
  e.cache = new Map();
  if (kind === "label") {
    if (e.label && e.label !== el) sizeObserver?.unobserve(e.label);
    e.label = el as HTMLElement | null;
    if (el) sizeObserver?.observe(el as HTMLElement);
  } else if (kind === "marker") e.marker = el as HTMLElement | null;
  else e.line = el as SVGLineElement | null;
}

export type Band = "roof" | "floor" | "body";
export const bandOf = (y: number): Band => (y >= 3.6 ? "roof" : y <= 1.3 ? "floor" : "body");

/** Callout layout in 3D: roof parts go up, underfloor parts out onto the floor, the rest out and up. */
export function computeOffsets(anchors: Record<string, Vec3>, parts: TrainPart[] = PARTS): Record<string, Vec3> {
  const groups: Record<Band, TrainPart[]> = { roof: [], floor: [], body: [] };
  for (const p of parts) groups[bandOf((anchors[p.id] ?? p.position)[1])].push(p);
  const out: Record<string, Vec3> = {};
  for (const [band, list] of Object.entries(groups) as Array<[Band, TrainPart[]]>) {
    list.sort((a, b) => (anchors[a.id] ?? a.position)[0] - (anchors[b.id] ?? b.position)[0]);
    list.forEach((p, i) => {
      if (p.labelOffset) {
        out[p.id] = p.labelOffset;
        return;
      }
      const a = anchors[p.id] ?? p.position;
      const k = i % 2;
      if (band === "roof") out[p.id] = [0, 1.4 + k * 0.8, 0];
      else if (band === "floor") out[p.id] = [0, -a[1], 2.8 - a[2] + k * 1.1];
      else out[p.id] = [0, 0.9 + k * 0.7, 2.4 - a[2]];
    });
  }
  return out;
}
