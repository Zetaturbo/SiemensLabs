"use client";
import { useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { useCases } from "@/lib/cases/store";
import { PARTS, type Vec3 } from "./config";
import { computeViews, DEFAULT_FILTERS, type Filters, type PartView } from "./encoding";

export type CameraRequest = { kind: "focus"; partId: string; n: number } | { kind: "reset"; n: number };
export type ModelStatus = "placeholder" | "loading" | "glb" | "error";

export interface InspectHit {
  object: string;
  path: string;
  point: Vec3;
  partId: string | null;
}

interface TrainUiState {
  selectedId: string | null;
  hoveredId: string | null;
  filters: Filters;
  camera: CameraRequest | null;
  /** Hotspot anchors of the active model (placeholder uses config positions, GLB may refine them). */
  anchors: Record<string, Vec3>;
  modelStatus: ModelStatus;
  modelError: string | null;
  /** Dev: force the procedural placeholder even when a GLB exists. */
  forcePlaceholder: boolean;
  glow: boolean;
  inspect: boolean;
  inspectHit: InspectHit | null;
  select: (id: string | null, opts?: { fly?: boolean }) => void;
  hover: (id: string | null) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
  resetView: () => void;
  setAnchors: (anchors: Record<string, Vec3>) => void;
  setModelStatus: (s: ModelStatus, error?: string | null) => void;
  setForcePlaceholder: (v: boolean) => void;
  setGlow: (v: boolean) => void;
  setInspect: (v: boolean) => void;
  setInspectHit: (hit: InspectHit | null) => void;
}

let n = 0;

export const DEFAULT_ANCHORS: Record<string, Vec3> = Object.fromEntries(PARTS.map((p) => [p.id, p.position]));

export const useTrainUi = create<TrainUiState>((set) => ({
  selectedId: null,
  hoveredId: null,
  filters: DEFAULT_FILTERS,
  camera: null,
  anchors: DEFAULT_ANCHORS,
  modelStatus: "placeholder",
  modelError: null,
  forcePlaceholder: false,
  glow: true,
  inspect: false,
  inspectHit: null,
  select: (id, opts) =>
    set(() => ({
      selectedId: id,
      ...(id && opts?.fly ? { camera: { kind: "focus" as const, partId: id, n: ++n } } : {}),
    })),
  hover: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: DEFAULT_FILTERS }),
  resetView: () => set({ camera: { kind: "reset", n: ++n } }),
  setAnchors: (anchors) => set({ anchors }),
  setModelStatus: (modelStatus, error = null) => set({ modelStatus, modelError: error }),
  setForcePlaceholder: (forcePlaceholder) => set({ forcePlaceholder }),
  setGlow: (glow) => set({ glow }),
  setInspect: (inspect) => set({ inspect, inspectHit: null }),
  setInspectHit: (inspectHit) => set({ inspectHit }),
}));

/** Per-part state derived from the shared case store and the filter bar. */
export function usePartViews(): PartView[] {
  const cases = useCases((s) => s.cases);
  const filters = useTrainUi((s) => s.filters);
  return useMemo(() => computeViews(cases, filters), [cases, filters]);
}

export function usePartViewMap(): Record<string, PartView> {
  const views = usePartViews();
  return useMemo(() => Object.fromEntries(views.map((v) => [v.part.id, v])), [views]);
}

const noop = () => () => {};

/** False during SSR and hydration, true afterwards (for clocks and other client-only values). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}
