"use client";
import { Grid } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { baseVisual, type PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { BlueprintPart } from "./blueprint";
import { partFromPieces, plainEdges } from "./edges";
import { CONTACT_WIRE_Y, rails, sleepers } from "./placeholder-geometry";

/** Grid floor, track and overhead contact wire: context only, not selectable. */
export function Ground() {
  const palette = usePalette();
  const track = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.3, interior: 0.6 }), [palette]);
  const wireVisual = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.26 }), [palette]);
  // rails and sleepers as one fill and one edge set: two draw calls for the whole track
  const track3d = useMemo(() => {
    const r = rails();
    const s = sleepers();
    const merged = partFromPieces([
      { geometry: r, threshold: 30 },
      { geometry: s, threshold: 30 },
    ]);
    r.dispose();
    s.dispose();
    return merged;
  }, []);
  useEffect(() => () => track3d.fill?.dispose(), [track3d]);
  const wire = useMemo(() => plainEdges([-34, CONTACT_WIRE_Y, 0, 18, CONTACT_WIRE_Y, 0, -34, CONTACT_WIRE_Y + 1.1, 0, 18, CONTACT_WIRE_Y + 1.1, 0]), []);
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
      <BlueprintPart fill={track3d.fill} edges={track3d.edges} visual={track} hidden={false} />
      <BlueprintPart fill={null} edges={wire} visual={wireVisual} hidden={false} />
    </group>
  );
}
