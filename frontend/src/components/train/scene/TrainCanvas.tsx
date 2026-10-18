"use client";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer } from "@react-three/postprocessing";
import { Suspense, useEffect, useState } from "react";
import { PaletteContext, readPalette } from "../palette";
import { useTrainUi } from "../store";
import { CameraRig, OVERVIEW } from "./CameraRig";
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
  const glow = useTrainUi((s) => s.glow);
  const forcePlaceholder = useTrainUi((s) => s.forcePlaceholder);
  const useGlb = modelUrl && !forcePlaceholder;
  const [palette] = useState(readPalette);

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
      <fog attach="fog" args={[palette.bg, 42, 115]} />
      <CameraRig />
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
      {glow && (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur intensity={0.6} luminanceThreshold={0.32} luminanceSmoothing={0.35} radius={0.6} />
        </EffectComposer>
      )}
      </PaletteContext.Provider>
    </Canvas>
  );
}
