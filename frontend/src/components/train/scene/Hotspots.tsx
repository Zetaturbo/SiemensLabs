"use client";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { Vector3 } from "three";
import { PARTS } from "../config";
import { bandOf, markerNodes, selectionNodes, type OverlayNode } from "../label-registry";
import { useTrainUi } from "../store";

/** Keep the label clear of the toolbar row at the top and the legend line at the bottom. */
const SAFE_TOP = 52;
const SAFE_BOTTOM = 40;
const EDGE = 8;
/** Screen-space leader: roof parts go up, underfloor parts down onto the floor, the rest up and out. */
const LEADER = { roof: [28, -64], floor: [28, 64], body: [44, -56] } as const;

const write = (n: OverlayNode<Element>, key: string, value: string) => {
  if (n.cache.get(key) === value) return false;
  n.cache.set(key, value);
  return true;
};

/** Point where the segment from the rect centre towards (px, py) leaves the rect. */
function edgePoint(x: number, y: number, w: number, h: number, px: number, py: number): [number, number] {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = px - cx;
  const dy = py - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
  return t >= 1 ? [cx, cy] : [cx + dx * t, cy + dy * t];
}

/**
 * Projects hotspot anchors to screen space every frame and writes the dot positions, plus the one
 * selection label and its leader line, straight to the DOM overlay (no React renders).
 */
export function Hotspots() {
  const v = useRef(new Vector3());

  useFrame(({ camera, size }) => {
    const { anchors, selectedId } = useTrainUi.getState();
    let sel: { ax: number; ay: number; band: keyof typeof LEADER } | null = null;

    for (const p of PARTS) {
      const a = anchors[p.id] ?? p.position;
      v.current.set(a[0], a[1], a[2]).project(camera);
      const ax = Math.round(((v.current.x + 1) / 2) * size.width);
      const ay = Math.round(((1 - v.current.y) / 2) * size.height);
      const front = v.current.z < 1 && ax > -10 && ax < size.width + 10 && ay > -10 && ay < size.height + 10;
      if (p.id === selectedId && front) sel = { ax, ay, band: bandOf(a[1]) };
      const n = markerNodes.get(p.id);
      if (!n?.el) continue;
      if (write(n, "vis", front ? "visible" : "hidden")) n.el.style.visibility = front ? "visible" : "hidden";
      if (front && write(n, "m", `${ax},${ay}`)) n.el.style.transform = `translate(${ax}px, ${ay}px)`;
    }

    const { label, line, w, h } = selectionNodes;
    if (!label.el || !line.el) return;
    const show = sel ? "visible" : "hidden";
    if (write(label, "vis", show)) label.el.style.visibility = show;
    if (write(line, "vis", show)) line.el.style.visibility = show;
    if (!sel) return;

    const [dx, dy] = LEADER[sel.band];
    // flip to the left when the label would run off the right edge
    const left = sel.ax + dx + w > size.width - EDGE;
    let x = left ? sel.ax - dx - w : sel.ax + dx;
    let y = sel.ay + dy - h / 2;
    x = Math.round(Math.max(EDGE, Math.min(size.width - w - EDGE, x)));
    y = Math.round(Math.max(SAFE_TOP, Math.min(size.height - h - SAFE_BOTTOM, y)));
    if (write(label, "l", `${x},${y}`)) label.el.style.transform = `translate(${x}px, ${y}px)`;
    const [ex, ey] = edgePoint(x, y, w, h, sel.ax, sel.ay);
    if (write(line, "line", `${sel.ax},${sel.ay},${ex | 0},${ey | 0}`)) {
      line.el.setAttribute("x1", String(sel.ax));
      line.el.setAttribute("y1", String(sel.ay));
      line.el.setAttribute("x2", String(ex | 0));
      line.el.setAttribute("y2", String(ey | 0));
    }
  });

  return null;
}
