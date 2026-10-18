"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Spinner } from "@/design-system/react";
import { CanvasOverlay } from "./CanvasOverlay";
import { FilterBar } from "./FilterBar";
import { HotspotLayer } from "./HotspotLayer";
import { resetMap } from "./MapControls";
import { PartPanel } from "./PartPanel";
import { readDiscovered, useTrainUi } from "./store";

const TrainCanvas = dynamic(() => import("./scene/TrainCanvas"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center" style={{ color: "var(--bp-text)" }}>
      <Spinner />
    </div>
  ),
});

const PULSE_CSS = `
@keyframes train-soft-pulse { 0% { transform: scale(0.7); opacity: 0.9 } 70% { transform: scale(1.9); opacity: 0 } 100% { transform: scale(1.9); opacity: 0 } }
@keyframes train-fade-in { from { opacity: 0 } to { opacity: 1 } }
.train-pulse { animation: train-soft-pulse 2.4s ease-out infinite; }
.train-label-in { animation: train-fade-in 160ms ease-out both; }
@media (prefers-reduced-motion: reduce) { .train-pulse { animation: none; opacity: 0.6; transform: scale(1.35); } .train-label-in { animation: none; } }
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
      if (e.key === "r" || e.key === "R") return resetMap();
      if (e.key === "+" || e.key === "=") return useTrainUi.getState().zoom(1);
      if (e.key === "-" || e.key === "_") return useTrainUi.getState().zoom(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const markInteracted = useTrainUi((s) => s.markInteracted);

  return (
    <div className="flex h-[calc(100dvh-3rem)] min-h-[600px] flex-col">
      <style>{PULSE_CSS}</style>
      <FilterBar />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section
          aria-label="3D train"
          className="relative isolate min-h-[420px] flex-1 overflow-hidden"
          style={{ background: "var(--bp-bg)" }}
          onPointerDownCapture={markInteracted}
          onWheelCapture={markInteracted}
        >
          <TrainCanvas modelUrl={modelUrl} />
          <HotspotLayer />
          <CanvasOverlay hasModel={!!modelUrl} />
        </section>
        {selected && (
          <aside aria-label="Selected part" className="flex w-full shrink-0 flex-col overflow-y-auto border-t border-line bg-surface lg:w-[380px] lg:border-t-0 lg:border-l">
            <PartPanel />
          </aside>
        )}
      </div>
    </div>
  );
}
