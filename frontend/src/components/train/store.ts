"use client";
import { useMemo, useSyncExternalStore } from "react";
import { create } from "zustand";
import { useCases } from "@/lib/cases/store";
import { PARTS, type Vec3 } from "./config";
import { computeViews, DEFAULT_FILTERS, type Filters, type PartView } from "./encoding";

export type CameraRequest =
  | { kind: "focus"; partId: string; n: number }
  | { kind: "reset"; n: number }
  | { kind: "zoom"; dir: 1 | -1; n: number };
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
  /** The visitor has selected a part at least once this session: the discovery rings stop. */
  discovered: boolean;
  /** Any pointer, wheel or key input on the map: the first-run hint fades. */
  interacted: boolean;
  inspect: boolean;
  inspectHit: InspectHit | null;
  select: (id: string | null, opts?: { fly?: boolean }) => void;
  hover: (id: string | null) => void;
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void;
  clearFilters: () => void;
  resetView: () => void;
  /** One zoom step towards (1) or away from (-1) the orbit target, the same step as a wheel notch. */
  zoom: (dir: 1 | -1) => void;
  setDiscovered: (v: boolean) => void;
  markInteracted: () => void;
  setAnchors: (anchors: Record<string, Vec3>) => void;
  setModelStatus: (s: ModelStatus, error?: string | null) => void;
  setForcePlaceholder: (v: boolean) => void;
  setInspect: (v: boolean) => void;
  setInspectHit: (hit: InspectHit | null) => void;
}

let n = 0;

const DISCOVERED_KEY = "train.discovered";

function rememberDiscovered() {
  try {
    sessionStorage.setItem(DISCOVERED_KEY, "1");
  } catch {}
}

/** Read after hydration so the server and first client render agree. */
export function readDiscovered(): boolean {
  try {
    return sessionStorage.getItem(DISCOVERED_KEY) === "1";
  } catch {
    return false;
  }
}

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
  discovered: false,
  interacted: false,
  inspect: false,
  inspectHit: null,
  select: (id, opts) =>
    set((s) => {
      if (id) {
        if (!s.discovered) rememberDiscovered();
        return {
          selectedId: id,
          discovered: true,
          interacted: true,
          ...(opts?.fly ? { camera: { kind: "focus" as const, partId: id, n: ++n } } : {}),
        };
      }
      // every way out of a selection (panel x, label x, Esc, empty click, Reset) eases back to the overview
      if (s.selectedId === null) return s;
      return { selectedId: null, camera: { kind: "reset" as const, n: ++n } };
    }),
  hover: (id) => set((s) => (s.hoveredId === id ? s : { hoveredId: id })),
  setFilter: (key, value) => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  clearFilters: () => set({ filters: DEFAULT_FILTERS }),
  resetView: () => set({ camera: { kind: "reset", n: ++n } }),
  zoom: (dir) => set({ camera: { kind: "zoom", dir, n: ++n }, interacted: true }),
  setDiscovered: (discovered) => set({ discovered }),
  markInteracted: () => set((s) => (s.interacted ? s : { interacted: true })),
  setAnchors: (anchors) => set({ anchors }),
  setModelStatus: (modelStatus, error = null) => set({ modelStatus, modelError: error }),
  setForcePlaceholder: (forcePlaceholder) => set({ forcePlaceholder }),
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
