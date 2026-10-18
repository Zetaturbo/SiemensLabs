"use client";
import { Box, Copy, Crosshair, ListTree } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Card, cn, IconButton, Tooltip } from "@/design-system/react";
import { FilterBar } from "./FilterBar";
import { Hint } from "./Hint";
import { Legend } from "./Legend";
import { MapControls } from "./MapControls";
import { PartSearch } from "./PartSearch";
import { useTrainUi } from "./store";

const DEV = process.env.NODE_ENV !== "production";

/** Model tools (placeholder toggle, inspector, mesh log) only in development and only with ?dev in the URL. */
function useDevTools(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => DEV && new URLSearchParams(window.location.search).has("dev"),
    () => false,
  );
}
const noSubscribe = () => () => {};

function Tool({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} side="bottom">
      <IconButton aria-label={label} aria-pressed={pressed} variant={pressed ? "primary" : "secondary"} size="md" className="pointer-events-auto" onClick={onClick}>
        {children}
      </IconButton>
    </Tooltip>
  );
}

function DevTools({ hasModel }: { hasModel: boolean }) {
  const status = useTrainUi((s) => s.modelStatus);
  const forcePlaceholder = useTrainUi((s) => s.forcePlaceholder);
  const setForcePlaceholder = useTrainUi((s) => s.setForcePlaceholder);
  const inspect = useTrainUi((s) => s.inspect);
  const setInspect = useTrainUi((s) => s.setInspect);
  const hit = useTrainUi((s) => s.inspectHit);
  return (
    <div className="absolute top-3 right-3 flex flex-col items-end gap-2">
      <div className="flex gap-1.5">
        {hasModel && (
          <Tool label={forcePlaceholder ? "Show GLB model" : "Show placeholder"} pressed={forcePlaceholder} onClick={() => setForcePlaceholder(!forcePlaceholder)}>
            <Box />
          </Tool>
        )}
        <Tool label="Inspect: click to read names and positions" pressed={inspect} onClick={() => setInspect(!inspect)}>
          <Crosshair />
        </Tool>
        {status === "glb" && (
          <Tool
            label="Log GLB meshes to the console"
            onClick={async () => {
              const { logGlbMeshes } = await import("./scene/GlbTrain");
              logGlbMeshes();
            }}
          >
            <ListTree />
          </Tool>
        )}
      </div>
      {inspect && (
        <Card variant="elevated" padding="sm" className="pointer-events-auto font-mono text-xs">
          {hit ? (
            <div className="space-y-0.5">
              <p>object: {hit.object}</p>
              <p className="max-w-80 truncate text-subtext">{hit.path}</p>
              <p>part: {hit.partId ?? "none"}</p>
              <p className="flex items-center gap-1">
                point: [{hit.point.join(", ")}]
                <IconButton aria-label="Copy position" size="sm" onClick={() => void navigator.clipboard?.writeText(`[${hit.point.join(", ")}]`)}>
                  <Copy />
                </IconButton>
              </p>
            </div>
          ) : (
            <p className="text-subtext">Click the model to read object name and position (train frame).</p>
          )}
        </Card>
      )}
    </div>
  );
}

/** Chrome on top of the canvas: view controls, the first-run hint, the legend and the model credit. */
export function CanvasOverlay({ hasModel }: { hasModel: boolean }) {
  const status = useTrainUi((s) => s.modelStatus);
  const error = useTrainUi((s) => s.modelError);
  const devTools = useDevTools();
  const panelOpen = useTrainUi((s) => s.selectedId !== null);

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <div className="pointer-events-auto absolute top-3 left-3 flex flex-wrap items-start gap-2 pr-3">
        <PartSearch />
        <FilterBar />
      </div>
      {devTools && <DevTools hasModel={hasModel} />}
      {/* the Next.js dev indicator sits in the bottom-left corner during development */}
      <div className={DEV ? "absolute bottom-16 left-3" : "absolute bottom-3 left-3"}>
        <MapControls />
      </div>
      <div className="absolute inset-x-0 bottom-3 flex justify-center">
        <Hint />
      </div>
      <div className={cn("absolute right-3 bottom-3 hidden flex-col items-end gap-1 sm:flex", panelOpen && "lg:right-[384px] max-lg:hidden")}>
        <Legend />
        {status === "error" && (
          <p className="font-mono text-2xs" style={{ color: "var(--bp-text)" }}>
            Model failed to load ({error}). Showing the schematic.
          </p>
        )}
        {status === "glb" && (
          <p className="pointer-events-auto text-2xs" style={{ color: "color-mix(in srgb, var(--bp-text) 60%, transparent)" }}>
            3D model{" "}
            <a className="underline underline-offset-2 hover:opacity-100" href="https://sketchfab.com/3d-models/aveeng-9cafbe3dbdeb499a8c4f86b267820228" target="_blank" rel="noreferrer">
              AVEENG
            </a>{" "}
            by dannzjs, CC-BY 4.0
          </p>
        )}
      </div>
    </div>
  );
}
