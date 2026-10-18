"use client";
import { useGLTF } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { Component, useEffect, useMemo, type ReactNode } from "react";
import { MODEL, PARTS } from "../config";
import { DEFAULT_ANCHORS, useTrainUi } from "../store";
import { BlueprintLines, FillMaterial } from "./blueprint";
import { BASE_KEY, prepareGlb, type MeshInfo, type PreparedPart } from "./glb-prepare";
import { PartGroup, usePartVisual } from "./PartGroup";

/** Draco decoding is set up but only fetched (from drei's default CDN) if the GLB is Draco-compressed. */
const USE_DRACO = true;

let lastMeshes: MeshInfo[] = [];
/** Dev helper: mesh table of the loaded GLB (name, material, triangles, centre and size in the train frame). */
export function logGlbMeshes() {
  console.table(lastMeshes);
}

function GlbPart({ partKey, data }: { partKey: string; data: PreparedPart }) {
  const partId = partKey === BASE_KEY ? null : partKey;
  const visual = usePartVisual(partId);
  const resolveName = (e: ThreeEvent<MouseEvent>) => (e.faceIndex != null ? data.faceNames[e.faceIndex] : undefined) ?? e.object.name;
  return (
    <PartGroup partId={partId} resolveName={resolveName}>
      {data.fill && (
        <mesh geometry={data.fill} renderOrder={-1}>
          <FillMaterial opacity={visual.fillOpacity} />
        </mesh>
      )}
      <BlueprintLines points={data.lines} visual={visual} />
    </PartGroup>
  );
}

export function GlbTrain({ url }: { url: string }) {
  const gltf = useGLTF(url, USE_DRACO);
  const prepared = useMemo(() => prepareGlb(gltf.scene, PARTS, MODEL), [gltf.scene]);
  const setModelStatus = useTrainUi((s) => s.setModelStatus);
  const setAnchors = useTrainUi((s) => s.setAnchors);

  useEffect(() => {
    lastMeshes = prepared.meshes;
    setModelStatus("glb");
    setAnchors(DEFAULT_ANCHORS);
    return () => {
      for (const p of Object.values(prepared.parts)) p.fill?.dispose();
    };
  }, [prepared, setModelStatus, setAnchors]);

  return (
    <group>
      {Object.entries(prepared.parts).map(([key, data]) => (
        <GlbPart key={key} partKey={key} data={data} />
      ))}
    </group>
  );
}

/** Marks the model as loading while the GLB suspends. */
export function GlbLoading() {
  const setModelStatus = useTrainUi((s) => s.setModelStatus);
  useEffect(() => setModelStatus("loading"), [setModelStatus]);
  return null;
}

/** Falls back to the placeholder when the GLB is missing or broken. */
export class ModelErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("[train] GLB failed to load, using the placeholder:", message);
    useTrainUi.getState().setModelStatus("error", message);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
