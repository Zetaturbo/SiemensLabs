"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, DoubleSide, GreaterDepth, LessEqualDepth, MeshBasicMaterial, type BufferGeometry } from "three";
import type { PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { useReducedMotion } from "../store";
import { edgeCount, type EdgeSet } from "./edges";
import { createLineGeometry, createLineMaterial, createLines, setLineViewport, type BlueprintLineMaterial } from "./line-material";
import { reveal } from "./motion";

/**
 * Blueprint rendering, shared by the GLB, the placeholder, the ground and the part thumbnails:
 * - the fill is near-transparent, drawn first (renderOrder -1) and writes depth with a polygon offset, so
 *   lines on its surface pass the depth test and lines behind it do not;
 * - visible edges are drawn with a normal depth test, silhouettes a little stronger than interior seams;
 * - hidden edges are drawn a second time with GreaterDepth at low opacity, like hidden lines on a drawing.
 * Appearance changes (hover, selection, filters) ease towards the new PartVisual in about 200 ms.
 */

/** Time constant of the hover and selection easing: about 200 ms to settle. */
const EASE_TAU = 0.055;
/** HDR boost of the selected part's edges in the dark theme; only values above 1 reach the bloom pass. */
const GLOW_BOOST = 0.9;

type Eased = { line: Color; fill: Color; lineOpacity: number; hiddenOpacity: number; fillOpacity: number; lineWidth: number; interior: number; glow: number };

const toEased = (v: PartVisual): Eased => ({
  line: new Color(v.color),
  fill: new Color(v.fillColor),
  lineOpacity: v.lineOpacity,
  hiddenOpacity: v.hiddenOpacity,
  fillOpacity: v.fillOpacity,
  lineWidth: v.lineWidth,
  interior: v.interior,
  glow: v.glow,
});

const NUMERIC = ["lineOpacity", "hiddenOpacity", "fillOpacity", "lineWidth", "interior", "glow"] as const;

/** Steps `cur` towards `target`; returns true while still moving. */
function ease(cur: Eased, target: Eased, k: number): boolean {
  let moving = false;
  for (const key of NUMERIC) {
    const d = target[key] - cur[key];
    if (Math.abs(d) > 1e-3) moving = true;
    cur[key] = Math.abs(d) > 1e-3 ? cur[key] + d * k : target[key];
  }
  for (const key of ["line", "fill"] as const) {
    const c = cur[key];
    const t = target[key];
    const d = Math.abs(t.r - c.r) + Math.abs(t.g - c.g) + Math.abs(t.b - c.b);
    if (d > 2e-3) {
      moving = true;
      c.lerp(t, k);
    } else c.copy(t);
  }
  return moving;
}

function applyLines(visible: BlueprintLineMaterial, hidden: BlueprintLineMaterial | null, hiddenObj: { visible: boolean } | null, cur: Eased, glowScale: number, r: number) {
  const boost = 1 + cur.glow * glowScale;
  visible.color.setRGB(cur.line.r * boost, cur.line.g * boost, cur.line.b * boost);
  visible.opacity = cur.lineOpacity * r;
  visible.linewidth = cur.lineWidth;
  visible.userData.uniforms.uInterior.value = cur.interior;
  if (hidden && hiddenObj) {
    hidden.color.copy(cur.line);
    hidden.opacity = cur.hiddenOpacity * r;
    hiddenObj.visible = hidden.opacity > 0.003;
  }
}

function applyFill(fill: MeshBasicMaterial | null, cur: Eased, r: number) {
  if (!fill) return;
  fill.color.copy(cur.fill);
  fill.opacity = cur.fillOpacity * r;
}

/** Fill plus edges of one part (or of any piece of context), easing towards `visual`. */
export function BlueprintPart({ fill, edges, visual, hidden = true }: { fill: BufferGeometry | null; edges: EdgeSet; visual: PartVisual; hidden?: boolean }) {
  const palette = usePalette();
  const reduced = useReducedMotion();
  const invalidate = useThree((s) => s.invalidate);
  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  const target = useMemo(() => toEased(visual), [visual]);
  const cur = useRef<Eased | null>(null);

  const objects = useMemo(() => {
    const hasLines = edgeCount(edges) > 0;
    const geometry = hasLines ? createLineGeometry(edges) : null;
    const vm = geometry ? createLineMaterial({ color: visual.color, opacity: visual.lineOpacity, linewidth: visual.lineWidth, depthFunc: LessEqualDepth, interior: visual.interior }) : null;
    const hm = geometry && hidden ? createLineMaterial({ color: visual.color, opacity: visual.hiddenOpacity, linewidth: 1, depthFunc: GreaterDepth, interior: 1 }) : null;
    const fm = fill
      ? new MeshBasicMaterial({ color: visual.fillColor, transparent: true, opacity: visual.fillOpacity, depthWrite: true, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, fog: true })
      : null;
    return {
      geometry,
      fillMaterial: fm,
      visible: geometry && vm ? { line: createLines(geometry, vm), material: vm } : null,
      hidden: geometry && hm ? { line: createLines(geometry, hm), material: hm } : null,
    };
    // materials are created once per geometry; later visual changes are eased in useFrame
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edges, fill, hidden]);

  useEffect(
    () => () => {
      objects.geometry?.dispose();
      objects.visible?.material.dispose();
      objects.hidden?.material.dispose();
      objects.fillMaterial?.dispose();
    },
    [objects],
  );

  useLayoutEffect(() => {
    for (const o of [objects.visible, objects.hidden]) if (o) setLineViewport(o.material, size.width, size.height, dpr);
    invalidate();
  }, [objects, size, dpr, invalidate]);

  useEffect(() => {
    invalidate();
  }, [target, invalidate]);

  useFrame((_, dt) => {
    cur.current ??= toEased(visual);
    const c = cur.current;
    const moving = ease(c, target, reduced ? 1 : 1 - Math.exp(-dt / EASE_TAU));
    const r = reveal.value;
    if (objects.visible) applyLines(objects.visible.material, objects.hidden?.material ?? null, objects.hidden?.line ?? null, c, palette.theme === "dark" ? GLOW_BOOST : 0, r);
    applyFill(objects.fillMaterial, c, r);
    if (moving) invalidate();
  });

  return (
    <>
      {fill && objects.fillMaterial && <mesh geometry={fill} material={objects.fillMaterial} renderOrder={-1} />}
      {objects.visible && <primitive object={objects.visible.line} />}
      {objects.hidden && <primitive object={objects.hidden.line} />}
    </>
  );
}

/** Wireframe of axis-aligned boxes as flat segment pairs. */
export function boxSegments(boxes: Array<{ min: [number, number, number]; max: [number, number, number] }>): number[] {
  const out: number[] = [];
  for (const { min, max } of boxes) {
    const c = (i: number): [number, number, number] => [i & 1 ? max[0] : min[0], i & 2 ? max[1] : min[1], i & 4 ? max[2] : min[2]];
    const edges = [
      [0, 1], [2, 3], [4, 5], [6, 7],
      [0, 2], [1, 3], [4, 6], [5, 7],
      [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    for (const [a, b] of edges) out.push(...c(a), ...c(b));
  }
  return out;
}
