"use client";
import { Edges, Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { DoubleSide, GreaterDepth, LessEqualDepth, type BufferGeometry } from "three";
import type { PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { useReducedMotion } from "../store";

/**
 * Blueprint rendering, shared by the placeholder and the GLB:
 * - fills are near-transparent, drawn first (renderOrder -1) and write depth with a polygon offset,
 * - visible edges are drawn with a normal depth test,
 * - hidden edges are drawn a second time with GreaterDepth at low opacity, like dashed hidden lines
 *   on a drawing; hovering or selecting a part raises them so the part reads as an x-ray.
 */

/** The parts of drei's Line2 / LineMaterial we animate (three-stdlib is not a direct dependency). */
type LineObj = { material: { opacity: number; dashOffset: number } } | null;

function useLineAnimation(visual: PartVisual) {
  const visibleRef = useRef<LineObj>(null);
  const hiddenRef = useRef<LineObj>(null);
  const reduced = useReducedMotion();
  useFrame((state, delta) => {
    const v = visibleRef.current?.material;
    const h = hiddenRef.current?.material;
    if (v) {
      const pulse = visual.pulse && !reduced ? 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 2.6)) : 1;
      v.opacity = visual.lineOpacity * pulse;
      if (visual.dashed && !reduced) v.dashOffset -= delta * 0.6;
    }
    if (h) {
      h.opacity = visual.hiddenOpacity;
      if (visual.dashed && !reduced) h.dashOffset -= delta * 0.6;
    }
  });
  return { visibleRef, hiddenRef };
}

const DASH = { dashSize: 0.22, gapSize: 0.12 };

export function FillMaterial({ opacity }: { opacity: number }) {
  const palette = usePalette();
  return (
    <meshBasicMaterial
      color={palette.fill}
      transparent
      opacity={opacity}
      depthWrite
      side={DoubleSide}
      polygonOffset
      polygonOffsetFactor={1}
      polygonOffsetUnits={1}
    />
  );
}

/** Two drei Edges passes for the parent mesh. */
export function BlueprintEdges({ visual, threshold = 12 }: { visual: PartVisual; threshold?: number }) {
  const { visibleRef, hiddenRef } = useLineAnimation(visual);
  return (
    <>
      <Edges
        ref={visibleRef as never}
        threshold={threshold}
        color={visual.color}
        lineWidth={visual.lineWidth}
        transparent
        depthWrite={false}
        depthFunc={LessEqualDepth}
        dashed={visual.dashed}
        {...DASH}
        fog
      />
      <Edges
        ref={hiddenRef as never}
        threshold={threshold}
        color={visual.color}
        lineWidth={visual.dashed ? 1.5 : 1}
        transparent
        depthWrite={false}
        depthFunc={GreaterDepth}
        dashed={visual.dashed}
        {...DASH}
        fog
      />
    </>
  );
}

/** Translucent mesh with blueprint edges. */
export function BlueprintMesh({
  geometry,
  visual,
  threshold,
  position,
  rotation,
}: {
  geometry: BufferGeometry;
  visual: PartVisual;
  threshold?: number;
  position?: [number, number, number];
  rotation?: [number, number, number];
}) {
  return (
    <mesh geometry={geometry} renderOrder={-1} position={position} rotation={rotation}>
      <FillMaterial opacity={visual.fillOpacity} />
      <BlueprintEdges visual={visual} threshold={threshold} />
    </mesh>
  );
}

/** Explicit line segments (pairs of points) in both passes. Used for the GLB and for outlines. */
export function BlueprintLines({ points, visual }: { points: number[]; visual: PartVisual }) {
  const { visibleRef, hiddenRef } = useLineAnimation(visual);
  if (points.length < 6) return null;
  return (
    <>
      <Line
        ref={visibleRef as never}
        points={points as unknown as [number, number, number][]}
        segments
        color={visual.color}
        lineWidth={visual.lineWidth}
        transparent
        depthWrite={false}
        depthFunc={LessEqualDepth}
        dashed={visual.dashed}
        {...DASH}
        fog
        raycast={() => null}
      />
      <Line
        ref={hiddenRef as never}
        points={points as unknown as [number, number, number][]}
        segments
        color={visual.color}
        lineWidth={visual.dashed ? 1.5 : 1}
        transparent
        depthWrite={false}
        depthFunc={GreaterDepth}
        dashed={visual.dashed}
        {...DASH}
        fog
        raycast={() => null}
      />
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
