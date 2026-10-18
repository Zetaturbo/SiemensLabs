"use client";

/**
 * Hotspot dots and the labels are plain DOM in one overlay (HotspotLayer), positioned by Hotspots inside
 * the canvas whenever a frame renders. This avoids one React root per dot (drei Html) and keeps per-frame
 * work out of React. Each node remembers the last values written (numbers, so the projector allocates
 * nothing while the view is still), and the DOM is only touched when they change.
 */
export interface OverlayNode<E extends Element = HTMLElement> {
  el: E | null;
  /** Last written visibility: -1 unknown, 0 hidden, 1 visible. */
  vis: number;
  /** Last written position (x, y; and x2, y2 for the leader line). */
  x: number;
  y: number;
  x2: number;
  y2: number;
}

const node = <E extends Element>(el: E | null): OverlayNode<E> => ({ el, vis: -1, x: NaN, y: NaN, x2: NaN, y2: NaN });

/** One dot per part. */
export const markerNodes = new Map<string, OverlayNode>();

/** The single label shown for the selected part, with its leader line. */
export const selectionNodes: { label: OverlayNode; line: OverlayNode<SVGLineElement>; w: number; h: number } = {
  label: node<HTMLElement>(null),
  line: node<SVGLineElement>(null),
  w: 120,
  h: 24,
};

/** The hover label: part name and stage next to the hovered dot. */
export const hoverNode: OverlayNode & { w: number; h: number } = { ...node<HTMLElement>(null), w: 120, h: 22 };

/** Asks the canvas for a frame (set by Hotspots), so a newly mounted label is placed right away. */
let requestFrame: () => void = () => {};
export function setFrameRequester(fn: () => void) {
  requestFrame = fn;
}

const sizeObserver =
  typeof ResizeObserver === "undefined"
    ? null
    : new ResizeObserver((items) => {
        for (const it of items) {
          selectionNodes.w = (it.target as HTMLElement).offsetWidth;
          selectionNodes.h = (it.target as HTMLElement).offsetHeight;
        }
        requestFrame();
      });

export function registerHoverLabel(el: HTMLElement | null) {
  Object.assign(hoverNode, node(el));
  if (el) {
    hoverNode.w = el.offsetWidth;
    hoverNode.h = el.offsetHeight;
    requestFrame();
  }
}

export function registerMarker(id: string, el: HTMLElement | null) {
  markerNodes.set(id, node(el));
  if (el) requestFrame();
}

export function registerSelectionLabel(el: HTMLElement | null) {
  const prev = selectionNodes.label.el;
  if (prev && prev !== el) sizeObserver?.unobserve(prev);
  selectionNodes.label = node(el);
  if (el) {
    selectionNodes.w = el.offsetWidth;
    selectionNodes.h = el.offsetHeight;
    sizeObserver?.observe(el);
    requestFrame();
  }
}

export function registerSelectionLine(el: SVGLineElement | null) {
  selectionNodes.line = node(el);
  if (el) requestFrame();
}

/** Writes visibility when it changed. */
export function writeVisibility<E extends HTMLElement | SVGElement>(n: OverlayNode<E>, visible: boolean) {
  const v = visible ? 1 : 0;
  if (n.vis === v || !n.el) return;
  n.vis = v;
  n.el.style.visibility = visible ? "visible" : "hidden";
}

/** Writes a translate when the position changed (the only string built while the view moves). */
export function writePosition(n: OverlayNode, x: number, y: number) {
  if ((n.x === x && n.y === y) || !n.el) return;
  n.x = x;
  n.y = y;
  n.el.style.transform = `translate(${x}px, ${y}px)`;
}

export type Band = "roof" | "floor" | "body";
export const bandOf = (y: number): Band => (y >= 3.6 ? "roof" : y <= 1.3 ? "floor" : "body");
