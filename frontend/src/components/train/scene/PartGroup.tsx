"use client";
import { useCursor } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import { useState, type ReactNode } from "react";
import { baseVisual, partVisual, type PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { usePartViewMap, useTrainUi } from "../store";

/** Visual state of a part (or the structural base when partId is null). */
export function usePartVisual(partId: string | null): PartVisual {
  const palette = usePalette();
  const views = usePartViewMap();
  const hovered = useTrainUi((s) => s.hoveredId === partId && partId !== null);
  const selected = useTrainUi((s) => s.selectedId === partId && partId !== null);
  const someoneSelected = useTrainUi((s) => s.selectedId !== null);
  if (!partId) return baseVisual(palette);
  return partVisual(palette, views[partId], hovered, selected, someoneSelected && !selected);
}

export type NameResolver = (e: ThreeEvent<MouseEvent>) => string;

const objectPath = (e: ThreeEvent<MouseEvent>) => {
  const names: string[] = [];
  for (let o: typeof e.object | null = e.object; o; o = o.parent) if (o.name) names.unshift(o.name);
  return names.join(" / ");
};

/** Pointer handling for one part: hover, click to select, double-click to fly, inspect in dev. */
export function PartGroup({ partId, children, resolveName }: { partId: string | null; children: ReactNode; resolveName?: NameResolver }) {
  const hover = useTrainUi((s) => s.hover);
  const select = useTrainUi((s) => s.select);
  const [over, setOver] = useState(false);
  useCursor(over && partId !== null);

  const report = (e: ThreeEvent<MouseEvent>) => {
    const ui = useTrainUi.getState();
    if (!ui.inspect) return false;
    const p = e.point;
    const hit = {
      object: resolveName ? resolveName(e) : e.object.name || "(unnamed)",
      path: objectPath(e),
      point: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)] as [number, number, number],
      partId,
    };
    ui.setInspectHit(hit);
    console.info("[train inspect]", hit);
    return true;
  };

  return (
    <group
      onPointerOver={(e) => {
        if (!partId) return;
        e.stopPropagation();
        setOver(true);
        hover(partId);
      }}
      onPointerOut={() => {
        if (!partId) return;
        setOver(false);
        if (useTrainUi.getState().hoveredId === partId) hover(null);
      }}
      onClick={(e) => {
        if (e.delta > 4) return;
        if (report(e)) return e.stopPropagation();
        if (!partId) return;
        e.stopPropagation();
        select(partId);
      }}
      onDoubleClick={(e) => {
        if (!partId) return;
        e.stopPropagation();
        select(partId, { fly: true });
      }}
    >
      {children}
    </group>
  );
}
