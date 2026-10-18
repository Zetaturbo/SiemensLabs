"use client";
import { useGLTF } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { MathUtils, Vector3, type Group, type PerspectiveCamera } from "three";
import { useCases } from "@/lib/cases/store";
import { MODEL } from "../config";
import { caseForPart, type PartVisual } from "../encoding";
import { PaletteContext, useBlueprintPalette, usePalette } from "../palette";
import { useReducedMotion } from "../store";
import { BlueprintLines, FillMaterial } from "./blueprint";
import { preparedGlb } from "./glb-prepare";
import { buildPieces } from "./PlaceholderTrain";
import { fillGeometry, thumbBounds, thumbFromGlb, thumbFromPieces, type ThumbScene } from "./thumbnail-geometry";

/** One turn per 24 s. */
const SPIN = (Math.PI * 2) / 24;
/** Camera elevation above the part's equator. */
const ELEVATION = 0.38;
const FOV = 30;

export interface Spin {
  /** Yaw and pitch added by dragging. */
  yaw: number;
  pitch: number;
  /** Auto-rotation paused until this time (performance.now), e.g. while and shortly after a drag. */
  pausedUntil: number;
  dragging: boolean;
  visible: boolean;
  /** Requests a frame (set by the canvas). */
  invalidate?: () => void;
}

// Mutations of three objects and of the shared spin state live in plain functions: the React compiler lint
// treats hook values and props as immutable, while these are frame-loop state by design.

function placeCamera(camera: PerspectiveCamera, d: number) {
  camera.position.set(0, Math.sin(ELEVATION) * d, Math.cos(ELEVATION) * d);
  camera.near = Math.max(0.01, d / 100);
  camera.far = d * 10;
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
}

/** Advances the auto-rotation and applies yaw and pitch; true while it keeps turning. */
function stepSpin(s: Spin, g: Group, delta: number, reduced: boolean): boolean {
  const auto = !reduced && s.visible && !s.dragging && performance.now() > s.pausedUntil;
  if (auto) s.yaw += Math.min(delta, 0.1) * SPIN;
  g.rotation.set(s.pitch, s.yaw, 0, "XYZ");
  return auto;
}

function bindInvalidate(s: Spin, fn: (() => void) | undefined) {
  s.invalidate = fn;
}

/** Checked once per page: without the GLB file every thumbnail uses the procedural geometry. */
let modelAvailable: Promise<boolean> | null = null;
function useModelAvailable(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    modelAvailable ??= fetch(MODEL.file, { method: "HEAD" })
      .then((r) => r.ok)
      .catch(() => false);
    void modelAvailable.then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, []);
  return ok;
}

function usePartVisualFor(partId: string): { part: PartVisual; context: PartVisual } {
  const palette = usePalette();
  const stage = useCases((s) => caseForPart(s.cases, partId)?.stage ?? "none");
  return useMemo(() => {
    // a part without a case is drawn in graphite rather than the grey "no case" colour, for legibility
    const color = stage === "none" ? palette.line : palette.stage[stage];
    return {
      part: { color, lineOpacity: 0.95, hiddenOpacity: 0.22, fillOpacity: palette.fillAlpha * 1.6, lineWidth: 1.25, dashed: false, pulse: false },
      context: { color: palette.line, lineOpacity: 0.14, hiddenOpacity: 0, fillOpacity: 0, lineWidth: 1, dashed: false, pulse: false },
    };
  }, [palette, stage]);
}

/** Centres the part, frames the camera to it and turns it slowly. */
function Framed({ scene, partId, spin, reduced, onReady }: { scene: ThumbScene; partId: string; spin: RefObject<Spin>; reduced: boolean; onReady: () => void }) {
  const visual = usePartVisualFor(partId);
  const group = useRef<Group>(null);
  const camera = useThree((s) => s.camera) as PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const fill = useMemo(() => fillGeometry(scene.part.fill), [scene]);
  useEffect(() => () => fill?.dispose(), [fill]);

  const frame = useMemo(() => {
    const b = thumbBounds(scene.part);
    const center = b.getCenter(new Vector3());
    let rxz = 0;
    const arrs = [scene.part.fill, scene.part.lines];
    for (const a of arrs) for (let i = 0; i + 2 < a.length; i += 3) rxz = Math.max(rxz, Math.hypot(a[i] - center.x, a[i + 2] - center.z));
    const hy = (b.max.y - b.min.y) / 2;
    return { center, rxz: Math.max(rxz, 0.05), hy: Math.max(hy, 0.05) };
  }, [scene]);

  useLayoutEffect(() => {
    // fit the cylinder the part sweeps while it turns, so it never leaves the frame
    const tanV = Math.tan(MathUtils.degToRad(FOV) / 2);
    const tanH = tanV * (size.width / Math.max(1, size.height));
    const h = frame.hy * Math.cos(ELEVATION) + frame.rxz * Math.sin(ELEVATION);
    const d = Math.max(frame.rxz / tanH, h / tanV) * 1.12 + frame.rxz * 0.35;
    placeCamera(camera, d);
    invalidate();
  }, [camera, frame, size, invalidate]);

  useEffect(() => {
    onReady();
  }, [onReady]);

  useFrame((_, delta) => {
    if (!group.current || !spin.current) return;
    // demand frame loop: keep frames coming only while turning
    if (stepSpin(spin.current, group.current, delta, reduced)) invalidate();
  });

  return (
    <group ref={group}>
      <group position={[-frame.center.x, -frame.center.y, -frame.center.z]}>
        {fill && (
          <mesh geometry={fill} renderOrder={-1}>
            <FillMaterial opacity={visual.part.fillOpacity} />
          </mesh>
        )}
        <BlueprintLines points={scene.part.lines} visual={visual.part} />
        {scene.context.lines.length > 0 && <BlueprintLines points={scene.context.lines} visual={visual.context} />}
      </group>
    </group>
  );
}

function FromGlb(props: { partId: string; spin: RefObject<Spin>; reduced: boolean; onReady: () => void }) {
  const gltf = useGLTF(MODEL.file, true);
  const scene = useMemo(() => thumbFromGlb(preparedGlb(gltf.scene), props.partId), [gltf.scene, props.partId]);
  return scene ? <Framed scene={scene} {...props} /> : <FromPieces {...props} />;
}

function FromPieces(props: { partId: string; spin: RefObject<Spin>; reduced: boolean; onReady: () => void }) {
  const scene = useMemo(() => {
    const pieces = buildPieces();
    const s = thumbFromPieces(pieces, props.partId);
    for (const list of Object.values(pieces)) for (const p of list) p.geometry.dispose();
    return s;
  }, [props.partId]);
  return scene ? <Framed scene={scene} {...props} /> : null;
}

class Fallback extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** The thumbnail's own small canvas: no post-processing, DPR capped at 2, frames only while turning. */
export default function PartThumbnailCanvas({
  partId,
  width,
  height,
  spin,
  onReady,
}: {
  partId: string;
  width: number;
  height: number;
  spin: RefObject<Spin>;
  onReady: () => void;
}) {
  const palette = useBlueprintPalette();
  const reduced = useReducedMotion();
  const glb = useModelAvailable();
  const props = { partId, spin, reduced, onReady };
  if (glb === null) return null;
  return (
    <Canvas
      frameloop="demand"
      dpr={[1, 2]}
      flat
      gl={{ antialias: true, powerPreference: "low-power" }}
      camera={{ fov: FOV, near: 0.05, far: 200 }}
      style={{ width, height }}
      aria-hidden
    >
      <PaletteContext.Provider value={palette}>
        <color attach="background" args={[palette.bg]} />
        {glb ? (
          <Fallback fallback={<FromPieces {...props} />}>
            <Suspense fallback={null}>
              <FromGlb {...props} />
            </Suspense>
          </Fallback>
        ) : (
          <FromPieces {...props} />
        )}
        <Kick spin={spin} />
      </PaletteContext.Provider>
    </Canvas>
  );
}

/** Hands the canvas's invalidate to the DOM side (drag, visibility, resume after a pause). */
function Kick({ spin }: { spin: RefObject<Spin> }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    const s = spin.current;
    if (!s) return;
    bindInvalidate(s, invalidate);
    invalidate();
    return () => bindInvalidate(s, undefined);
  }, [spin, invalidate]);
  return null;
}
