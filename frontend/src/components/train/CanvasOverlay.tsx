"use client";
import { Box, Copy, Crosshair, ListTree, RotateCcw, Sparkles } from "lucide-react";
import { Card, IconButton, Tooltip } from "@/design-system/react";
import { Legend } from "./Legend";
import { useTrainUi } from "./store";

const DEV = process.env.NODE_ENV !== "production";

function Tool({ label, pressed, onClick, children }: { label: string; pressed?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip label={label} side="bottom">
      <IconButton
        aria-label={label}
        aria-pressed={pressed}
        variant={pressed ? "primary" : "secondary"}
        size="md"
        className="pointer-events-auto"
        onClick={onClick}
      >
        {children}
      </IconButton>
    </Tooltip>
  );
}

/** Chrome on top of the canvas: reset, glow, the one-line legend, model credit and dev tools. */
export function CanvasOverlay({ hasModel }: { hasModel: boolean }) {
  const resetView = useTrainUi((s) => s.resetView);
  const select = useTrainUi((s) => s.select);
  const glow = useTrainUi((s) => s.glow);
  const setGlow = useTrainUi((s) => s.setGlow);
  const status = useTrainUi((s) => s.modelStatus);
  const error = useTrainUi((s) => s.modelError);
  const forcePlaceholder = useTrainUi((s) => s.forcePlaceholder);
  const setForcePlaceholder = useTrainUi((s) => s.setForcePlaceholder);
  const inspect = useTrainUi((s) => s.inspect);
  const setInspect = useTrainUi((s) => s.setInspect);
  const hit = useTrainUi((s) => s.inspectHit);

  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex flex-col justify-between p-3">
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-2xs tracking-[0.08em] uppercase" style={{ color: "var(--bp-text)" }}>
          <span className="opacity-70">{status === "loading" ? "Loading model" : status === "glb" ? "Velaro-class end car" : "Schematic train"}</span>
          <span className="ml-3 tracking-normal normal-case opacity-45">Drag to orbit, scroll to zoom, click a dot, Esc to reset</span>
        </p>
        <div className="flex gap-1.5">
          {DEV && hasModel && (
            <Tool label={forcePlaceholder ? "Show GLB model" : "Show placeholder"} pressed={forcePlaceholder} onClick={() => setForcePlaceholder(!forcePlaceholder)}>
              <Box />
            </Tool>
          )}
          {DEV && (
            <Tool label="Inspect: click to read names and positions" pressed={inspect} onClick={() => setInspect(!inspect)}>
              <Crosshair />
            </Tool>
          )}
          {DEV && status === "glb" && (
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
          <Tool label={glow ? "Glow off" : "Glow on"} pressed={glow} onClick={() => setGlow(!glow)}>
            <Sparkles />
          </Tool>
          <Tool
            label="Reset view (Esc)"
            onClick={() => {
              select(null);
              resetView();
            }}
          >
            <RotateCcw />
          </Tool>
        </div>
      </div>

      {inspect && (
        <Card variant="elevated" padding="sm" className="pointer-events-auto self-end font-mono text-xs">
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

      <div className="flex items-end justify-between gap-3">
        <Legend />
        <div className="shrink-0 text-right font-mono text-[10px] leading-tight" style={{ color: "var(--bp-text)" }}>
          {status === "error" && <p className="opacity-80">Model failed to load ({error}). Showing the schematic.</p>}
          {status === "glb" && (
            <p className="pointer-events-auto opacity-50">
              3D model{" "}
              <a className="underline hover:opacity-100" href="https://sketchfab.com/3d-models/aveeng-9cafbe3dbdeb499a8c4f86b267820228" target="_blank" rel="noreferrer">
                AVEENG
              </a>{" "}
              by dannzjs, CC-BY 4.0
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
