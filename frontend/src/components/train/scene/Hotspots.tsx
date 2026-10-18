"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Vector3 } from "three";
import { PARTS } from "../config";
import { bandOf, computeOffsets, labelNodes } from "../label-registry";
import { useTrainUi } from "../store";

/** Distance below which labels show stage and owner. */
const DETAIL_DISTANCE = 15;
const PAD = 6;
const SAFE_TOP = 52;
const SAFE_BOTTOM = 84;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w + PAD && b.x < a.x + a.w + PAD && a.y < b.y + b.h + PAD && b.y < a.y + a.h + PAD;

/** Point where the segment from the rect centre towards (px, py) leaves the rect. */
function edgePoint(r: Rect, px: number, py: number): [number, number] {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = px - cx;
  const dy = py - cy;
  if (!dx && !dy) return [cx, cy];
  const t = Math.min(dx ? r.w / 2 / Math.abs(dx) : Infinity, dy ? r.h / 2 / Math.abs(dy) : Infinity);
  return t >= 1 ? [cx, cy] : [cx + dx * t, cy + dy * t];
}

/**
 * Projects hotspot anchors and their callout points to screen space every frame, pushes labels
 * apart where they collide, and writes positions straight to the DOM overlay (no React renders).
 */
export function Hotspots() {
  const anchors = useTrainUi((s) => s.anchors);
  const offsets = useMemo(() => computeOffsets(anchors), [anchors]);
  const v = useRef(new Vector3());

  useFrame(({ camera, size }) => {
    const placed: Rect[] = [];
    const items = PARTS.map((p) => {
      const a = anchors[p.id] ?? p.position;
      const o = offsets[p.id];
      v.current.set(a[0], a[1], a[2]).project(camera);
      const ax = ((v.current.x + 1) / 2) * size.width;
      const ay = ((1 - v.current.y) / 2) * size.height;
      const front = v.current.z < 1 && ax > -10 && ax < size.width + 10 && ay > -10 && ay < size.height + 10;
      v.current.set(a[0] + o[0], a[1] + o[1], a[2] + o[2]).project(camera);
      const lx = ((v.current.x + 1) / 2) * size.width;
      const ly = ((1 - v.current.y) / 2) * size.height;
      const dist = camera.position.distanceTo(v.current.set(a[0], a[1], a[2]));
      return { id: p.id, band: bandOf(a[1]), ax: Math.round(ax), ay: Math.round(ay), lx, ly, front, dist };
    });
    // markers are obstacles for every label; nearest labels are placed first and keep their spot
    for (const it of items) if (it.front) placed.push({ x: it.ax - 10, y: it.ay - 10, w: 20, h: 20 });
    items.sort((a, b) => a.dist - b.dist);
    for (const it of items) {
      const n = labelNodes.get(it.id);
      if (!n?.marker || !n.label || !n.line) continue;
      const changed = (key: string, value: string) => {
        if (n.cache.get(key) === value) return false;
        n.cache.set(key, value);
        return true;
      };
      const show = it.front ? "visible" : "hidden";
      if (changed("vis", show)) {
        n.marker.style.visibility = show;
        n.label.style.visibility = show;
        n.line.style.visibility = show;
      }
      if (!it.front) continue;
      const r: Rect = { x: it.lx - n.w / 2, y: it.ly - n.h / 2, w: n.w, h: n.h };
      const dir = it.band === "floor" ? 1 : -1;
      for (let i = 0; i < 24 && placed.some((p) => overlaps(p, r)); i++) r.y += dir * (n.h * 0.5 + 2);
      // keep clear of the toolbar row at the top and the legend at the bottom
      r.x = Math.round(Math.max(4, Math.min(size.width - r.w - 4, r.x)));
      r.y = Math.round(Math.max(SAFE_TOP, Math.min(size.height - r.h - SAFE_BOTTOM, r.y)));
      placed.push(r);
      if (changed("m", `${it.ax},${it.ay}`)) n.marker.style.transform = `translate(${it.ax}px, ${it.ay}px)`;
      if (changed("l", `${r.x},${r.y}`)) n.label.style.transform = `translate(${r.x}px, ${r.y}px)`;
      const [ex, ey] = edgePoint(r, it.ax, it.ay);
      if (changed("line", `${it.ax},${it.ay},${ex | 0},${ey | 0}`)) {
        n.line.setAttribute("x1", String(it.ax));
        n.line.setAttribute("y1", String(it.ay));
        n.line.setAttribute("x2", String(ex | 0));
        n.line.setAttribute("y2", String(ey | 0));
      }
      const near = it.dist < DETAIL_DISTANCE ? "1" : "0";
      if (changed("near", near)) n.label.dataset.near = near;
    }
  });

  return null;
}
