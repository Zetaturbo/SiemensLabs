"use client";
import { Canvas } from "@react-three/fiber";
import { Suspense, useEffect } from "react";
import { PaletteContext, useBlueprintPalette } from "../palette";
import { useTrainUi } from "../store";
import { CameraRig, OVERVIEW } from "./CameraRig";
import { CanvasCursor } from "./CanvasCursor";
import { GlbLoading, GlbTrain, ModelErrorBoundary } from "./GlbTrain";
import { Ground } from "./Ground";
import { Hotspots } from "./Hotspots";
import { PlaceholderTrain } from "./PlaceholderTrain";

function PlaceholderOnly() {
  const setModelStatus = useTrainUi((s) => s.setModelStatus);
  useEffect(() => setModelStatus("placeholder"), [setModelStatus]);
  return <PlaceholderTrain />;
}

/** Client-only R3F scene. Loaded with next/dynamic (ssr: false) from TrainScreen. */
export default function TrainCanvas({ modelUrl }: { modelUrl: string | null }) {
  const forcePlaceholder = useTrainUi((s) => s.forcePlaceholder);
  const useGlb = modelUrl && !forcePlaceholder;
  const palette = useBlueprintPalette();

  return (
    <Canvas
      className="!absolute inset-0"
      camera={{ fov: 35, near: 0.1, far: 400, position: OVERVIEW.glb.position }}
      dpr={[1, 1.75]}
      flat
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => {
        // a click on empty space (no drag) deselects and hides the label
        const ui = useTrainUi.getState();
        ui.hover(null);
        if (!ui.inspect) ui.select(null);
      }}
    >
      <PaletteContext.Provider value={palette}>
      <color attach="background" args={[palette.bg]} />
      {/* horizon fog: the far track and grid melt into the sheet */}
      <fog attach="fog" args={[palette.bg, 38, 105]} />
      <CameraRig />
      <CanvasCursor />
      <Ground />
      {useGlb ? (
        <ModelErrorBoundary key={modelUrl} fallback={<PlaceholderTrain />}>
          <Suspense fallback={<GlbLoading />}>
            <GlbTrain url={modelUrl} />
          </Suspense>
        </ModelErrorBoundary>
      ) : (
        <PlaceholderOnly />
      )}
      <Hotspots />
      </PaletteContext.Provider>
    </Canvas>
  );
}
