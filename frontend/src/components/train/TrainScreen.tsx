"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import "./blueprint.css";
import { CanvasOverlay } from "./CanvasOverlay";
import { HotspotLayer } from "./HotspotLayer";
import { resetMap } from "./MapControls";
import { PartPanel } from "./PartPanel";
import { focusPartSearch } from "./PartSearch";
import { readDiscovered, useTrainUi } from "./store";

/**
 * Loading state of the canvas: a quiet outline of what is coming (a car body over a track on the sheet),
 * pulsing softly, instead of a spinner. Shown while the canvas code and then the model load.
 */
function CanvasSkeleton({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden
      data-testid="train-skeleton"
      className="pointer-events-none absolute inset-0 grid place-items-center transition-opacity duration-[var(--lw-duration-enter)] ease-out motion-reduce:transition-none"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <div className="flex w-[min(64%,880px)] animate-pulse flex-col items-center gap-3 motion-reduce:animate-none">
        <div className="h-[clamp(64px,13vh,140px)] w-full rounded-[2rem_6rem_1.25rem_1.25rem] border" style={{ borderColor: "color-mix(in srgb, var(--bp-line) 14%, transparent)", background: "color-mix(in srgb, var(--bp-line) 4%, transparent)" }} />
        <div className="h-px w-[112%]" style={{ background: "color-mix(in srgb, var(--bp-line) 16%, transparent)" }} />
      </div>
    </div>
  );
}

const TrainCanvas = dynamic(() => import("./scene/TrainCanvas"), {
  ssr: false,
  loading: () => <CanvasSkeleton visible />,
});

const PULSE_CSS = `
@keyframes train-soft-pulse { 0% { transform: scale(0.7); opacity: 0.9 } 70% { transform: scale(1.9); opacity: 0 } 100% { transform: scale(1.9); opacity: 0 } }
@keyframes train-fade-in { from { opacity: 0 } to { opacity: 1 } }
.train-pulse { animation: train-soft-pulse 2.4s ease-out infinite; }
@keyframes train-panel-in { from { opacity: 0; transform: translateX(8px) } to { opacity: 1; transform: none } }
.train-label-in { animation: train-fade-in 160ms ease-out both; }
.train-panel-in { animation: train-panel-in var(--lw-duration-slow) var(--lw-ease-out) both; }
/* the dots arrive as the intro settles */
.train-dots-in { animation: train-fade-in 450ms var(--lw-ease-out) 750ms both; }
@media (prefers-reduced-motion: reduce) { .train-pulse { animation: none; opacity: 0.6; transform: scale(1.35); } .train-label-in, .train-panel-in, .train-dots-in { animation: none; } }
`;

/** Home screen: blueprint train with the filter bar above; the part panel opens beside it on selection. */
export function TrainScreen({ modelUrl }: { modelUrl: string | null }) {
  const selected = useTrainUi((s) => s.selectedId !== null);
  useEffect(() => {
    if (readDiscovered()) useTrainUi.getState().setDiscovered(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
      if (e.key === "Escape") {
        if (t && typing) return;
        return resetMap();
      }
      if (typing) return;
      if (e.key === "/") {
        e.preventDefault();
        return focusPartSearch();
      }
      if (e.key === "r" || e.key === "R") return resetMap();
      if (e.key === "+" || e.key === "=") return useTrainUi.getState().zoom(1);
      if (e.key === "-" || e.key === "_") return useTrainUi.getState().zoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const markInteracted = useTrainUi((s) => s.markInteracted);
  const loading = useTrainUi((s) => s.modelStatus === "loading");

  return (
    <section
      aria-label="Train map"
      className="@container relative isolate h-full min-h-[560px] flex-1 overflow-hidden"
      style={{ background: "var(--bp-bg)" }}
      onPointerDownCapture={markInteracted}
      onWheelCapture={markInteracted}
    >
      <style>{PULSE_CSS}</style>
      <div data-testid="train-canvas" className="absolute inset-0">
        <TrainCanvas modelUrl={modelUrl} />
      </div>
      <CanvasSkeleton visible={loading} />
      {!loading && <HotspotLayer />}
      <CanvasOverlay hasModel={!!modelUrl} />
      {selected && (
        <aside
          aria-label="Selected part"
          className="train-panel-in absolute inset-x-3 bottom-3 z-30 max-h-[55%] overflow-y-auto rounded-xl border border-line bg-surface shadow-lg @min-[1024px]:top-3 @min-[1024px]:right-3 @min-[1024px]:bottom-auto @min-[1024px]:left-auto @min-[1024px]:max-h-[calc(100%-1.5rem)] @min-[1024px]:w-[360px]"
        >
          <PartPanel />
        </aside>
      )}
    </section>
  );
}
