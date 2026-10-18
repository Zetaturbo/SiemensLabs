"use client";
import { Grid } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { baseVisual, type PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { BlueprintLines, BlueprintMesh } from "./blueprint";
import { CONTACT_WIRE_Y, rails, sleepers } from "./placeholder-geometry";

/** Grid floor, track and overhead contact wire: context only, not selectable. */
export function Ground() {
  const palette = usePalette();
  const track = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.3, hiddenOpacity: 0.05 }), [palette]);
  const wireVisual = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.32, hiddenOpacity: 0.32 }), [palette]);
  const geo = useMemo(() => ({ rails: rails(), sleepers: sleepers() }), []);
  useEffect(
    () => () => {
      geo.rails.dispose();
      geo.sleepers.dispose();
    },
    [geo],
  );
  const wire = useMemo(() => [-46, CONTACT_WIRE_Y, 0, 22, CONTACT_WIRE_Y, 0, -46, CONTACT_WIRE_Y + 1.1, 0, 22, CONTACT_WIRE_Y + 1.1, 0], []);
  return (
    <group>
      <Grid
        position={[0, -0.33, 0]}
        args={[240, 240]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={palette.grid}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={palette.gridSection}
        fadeDistance={95}
        fadeStrength={1.6}
        infiniteGrid
      />
      <BlueprintMesh geometry={geo.rails} visual={track} threshold={30} />
      <BlueprintMesh geometry={geo.sleepers} visual={track} threshold={30} />
      <BlueprintLines points={wire} visual={wireVisual} />
    </group>
  );
}
