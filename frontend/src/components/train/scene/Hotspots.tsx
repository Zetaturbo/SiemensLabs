"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { Vector3 } from "three";
import { PARTS } from "../config";
import { bandOf, hoverNode, markerNodes, selectionNodes, setFrameRequester, writePosition, writeVisibility, type Band } from "../label-registry";
import { panelInset } from "../layout";
import { useTrainUi } from "../store";

/** Keep the label clear of the toolbar row at the top and the controls and credit at the bottom. */
const SAFE_TOP = 56;
const SAFE_BOTTOM = 56;
const EDGE = 8;
/** Screen-space leader: roof parts go up, underfloor parts down onto the floor, the rest up and out. */
const LEADER_DX: Record<Band, number> = { roof: 28, floor: 28, body: 44 };
const LEADER_DY: Record<Band, number> = { roof: -64, floor: 64, body: -56 };

// scratch state, reused every frame: the projector allocates nothing while the view is still
const v = new Vector3();
const sel = { on: false, ax: 0, ay: 0, band: "body" as Band };
const hov = { on: false, ax: 0, ay: 0 };
const edge = { x: 0, y: 0 };

/** Point where the segment from the rect centre towards (px, py) leaves the rect, into `edge`. */
function edgePoint(x: number, y: number, w: number, h: number, px: number, py: number) {
  const cx = x + w / 2;
  const cy = y + h / 2;
  const dx = px - cx;
  const dy = py - cy;
  const t = !dx && !dy ? 1 : Math.min(dx ? w / 2 / Math.abs(dx) : Infinity, dy ? h / 2 / Math.abs(dy) : Infinity);
  edge.x = t >= 1 ? cx : cx + dx * t;
  edge.y = t >= 1 ? cy : cy + dy * t;
}

function writeLine(x1: number, y1: number, x2: number, y2: number) {
  const n = selectionNodes.line;
  if (!n.el || (n.x === x1 && n.y === y1 && n.x2 === x2 && n.y2 === y2)) return;
  n.x = x1;
  n.y = y1;
  n.x2 = x2;
  n.y2 = y2;
  n.el.setAttribute("x1", String(x1));
  n.el.setAttribute("y1", String(y1));
  n.el.setAttribute("x2", String(x2));
  n.el.setAttribute("y2", String(y2));
}

/**
 * Projects hotspot anchors to screen space on every rendered frame and writes the dot positions, the hover
 * label and the one selection label with its leader line straight to the DOM overlay (no React renders).
 * The canvas renders on demand, so this also asks for a frame when selection, hover or anchors change.
 */
export function Hotspots() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    setFrameRequester(invalidate);
    const unsub = useTrainUi.subscribe((s, p) => {
      if (s.selectedId !== p.selectedId || s.hoveredId !== p.hoveredId || s.anchors !== p.anchors) invalidate();
    });
    return () => {
      unsub();
      setFrameRequester(() => {});
    };
  }, [invalidate]);

  useFrame(({ camera, size }) => {
    const { anchors, selectedId, hoveredId } = useTrainUi.getState();
    sel.on = false;
    hov.on = false;

    for (const p of PARTS) {
      const a = anchors[p.id] ?? p.position;
      v.set(a[0], a[1], a[2]).project(camera);
      const ax = Math.round(((v.x + 1) / 2) * size.width);
      const ay = Math.round(((1 - v.y) / 2) * size.height);
      const front = v.z < 1 && ax > -10 && ax < size.width + 10 && ay > -10 && ay < size.height + 10;
      if (front && p.id === selectedId) {
        sel.on = true;
        sel.ax = ax;
        sel.ay = ay;
        sel.band = bandOf(a[1]);
      } else if (front && p.id === hoveredId) {
        hov.on = true;
        hov.ax = ax;
        hov.ay = ay;
      }
      const n = markerNodes.get(p.id);
      if (!n?.el) continue;
      writeVisibility(n, front);
      if (front) writePosition(n, ax, ay);
    }

    // hover label: right of the dot, flipped left near the right edge or the open panel
    const right = size.width - (selectedId ? panelInset(size.width) : 0);
    writeVisibility(hoverNode, hov.on);
    if (hov.on) {
      const hx = hov.ax + 14 + hoverNode.w > right - EDGE ? hov.ax - 14 - hoverNode.w : hov.ax + 14;
      writePosition(hoverNode, hx, hov.ay - Math.round(hoverNode.h / 2));
    }

    const { label, line, w, h } = selectionNodes;
    writeVisibility(label, sel.on);
    writeVisibility(line, sel.on);
    if (!sel.on || !label.el) return;

    const dx = LEADER_DX[sel.band];
    const dy = LEADER_DY[sel.band];
    // flip to the left when the label would run into the right edge or the panel
    const left = sel.ax + dx + w > right - EDGE;
    const x = Math.round(Math.max(EDGE, Math.min(right - w - EDGE, left ? sel.ax - dx - w : sel.ax + dx)));
    const y = Math.round(Math.max(SAFE_TOP, Math.min(size.height - h - SAFE_BOTTOM, sel.ay + dy - h / 2)));
    writePosition(label, x, y);
    edgePoint(x, y, w, h, sel.ax, sel.ay);
    writeLine(sel.ax, sel.ay, edge.x | 0, edge.y | 0);
  });

  return null;
}
