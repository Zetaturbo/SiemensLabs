"use client";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { Spinner } from "@/design-system/react";
import "./blueprint.css";
import { CanvasOverlay } from "./CanvasOverlay";
import { HotspotLayer } from "./HotspotLayer";
import { resetMap } from "./MapControls";
import { PartPanel } from "./PartPanel";
import { focusPartSearch } from "./PartSearch";
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
@keyframes train-panel-in { from { opacity: 0; transform: translateX(8px) } to { opacity: 1; transform: none } }
.train-label-in { animation: train-fade-in 160ms ease-out both; }
.train-panel-in { animation: train-panel-in var(--lw-duration-slow) var(--lw-ease-out) both; }
@media (prefers-reduced-motion: reduce) { .train-pulse { animation: none; opacity: 0.6; transform: scale(1.35); } .train-label-in, .train-panel-in { animation: none; } }
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

  return (
    <section
      aria-label="Train map"
      className="relative isolate h-[calc(100dvh-3rem)] min-h-[560px] overflow-hidden"
      style={{ background: "var(--bp-bg)" }}
      onPointerDownCapture={markInteracted}
      onWheelCapture={markInteracted}
    >
      <style>{PULSE_CSS}</style>
      <div data-testid="train-canvas" className="absolute inset-0">
        <TrainCanvas modelUrl={modelUrl} />
      </div>
      <HotspotLayer />
      <CanvasOverlay hasModel={!!modelUrl} />
      {selected && (
        <aside
          aria-label="Selected part"
          className="train-panel-in absolute inset-x-3 bottom-3 z-30 max-h-[55%] overflow-y-auto rounded-xl border border-line bg-surface shadow-lg lg:top-3 lg:right-3 lg:bottom-auto lg:left-auto lg:max-h-[calc(100%-1.5rem)] lg:w-[360px]"
        >
          <PartPanel />
        </aside>
      )}
    </section>
  );
}
