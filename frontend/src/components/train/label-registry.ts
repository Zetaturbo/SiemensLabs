"use client";

/**
 * Hotspot dots and the one selection label are plain DOM in one overlay (HotspotLayer), positioned
 * every frame by Hotspots inside the canvas. This avoids one React root per dot (drei Html) and keeps
 * per-frame work out of React.
 */
export interface OverlayNode<E extends Element = HTMLElement> {
  el: E | null;
  /** Last values written by the projector; reset when a node is (re)registered. */
  cache: Map<string, string>;
}

/** One dot per part. */
export const markerNodes = new Map<string, OverlayNode>();

/** The single label shown for the selected part, with its leader line. */
export const selectionNodes: { label: OverlayNode; line: OverlayNode<SVGLineElement>; w: number; h: number } = {
  label: { el: null, cache: new Map() },
  line: { el: null, cache: new Map() },
  w: 120,
  h: 24,
};

const sizeObserver =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((items) => {
        for (const it of items) {
          selectionNodes.w = (it.target as HTMLElement).offsetWidth;
          selectionNodes.h = (it.target as HTMLElement).offsetHeight;
        }
      });

/** The hover label: part name and stage next to the hovered dot. */
export const hoverNode: OverlayNode & { w: number; h: number } = { el: null, cache: new Map(), w: 120, h: 22 };

export function registerHoverLabel(el: HTMLElement | null) {
  hoverNode.el = el;
  hoverNode.cache = new Map();
  if (el) {
    hoverNode.w = el.offsetWidth;
    hoverNode.h = el.offsetHeight;
  }
}

export function registerMarker(id: string, el: HTMLElement | null) {
  markerNodes.set(id, { el, cache: new Map() });
}

export function registerSelectionLabel(el: HTMLElement | null) {
  const prev = selectionNodes.label.el;
  if (prev && prev !== el) sizeObserver?.unobserve(prev);
  selectionNodes.label = { el, cache: new Map() };
  if (el) {
    selectionNodes.w = el.offsetWidth;
    selectionNodes.h = el.offsetHeight;
    sizeObserver?.observe(el);
  }
}

export function registerSelectionLine(el: SVGLineElement | null) {
  selectionNodes.line = { el, cache: new Map() };
}

export type Band = "roof" | "floor" | "body";
export const bandOf = (y: number): Band => (y >= 3.6 ? "roof" : y <= 1.3 ? "floor" : "body");
