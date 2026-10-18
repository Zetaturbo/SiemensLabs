"use client";
import { Grid } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { baseVisual, type PartVisual } from "../encoding";
import { usePalette } from "../palette";
import { BlueprintPart } from "./blueprint";
import { BED_Y, ContactShadow } from "./ContactShadow";
import { partFromPieces, plainEdges } from "./edges";
import { CONTACT_WIRE_Y, rails, sleepers } from "./placeholder-geometry";

/** Grid floor, track and overhead contact wire: context only, not selectable. */
export function Ground() {
  const palette = usePalette();
  const track = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.3, interior: 0.6 }), [palette]);
  const wireVisual = useMemo<PartVisual>(() => ({ ...baseVisual(palette), lineOpacity: 0.18 }), [palette]);
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
      {/* a fine 1 m grid with 5 m sections that fades out towards the horizon, where the fog takes over */}
      <Grid
        position={[0, BED_Y, 0]}
        args={[240, 240]}
        cellSize={1}
        cellThickness={0.55}
        cellColor={palette.grid}
        sectionSize={5}
        sectionThickness={0.9}
        sectionColor={palette.gridSection}
        fadeDistance={78}
        fadeStrength={2.2}
        fadeFrom={1}
        infiniteGrid
      />
      <ContactShadow />
      <BlueprintPart fill={track3d.fill} edges={track3d.edges} visual={track} hidden={false} />
      <BlueprintPart fill={null} edges={wire} visual={wireVisual} hidden={false} />
    </group>
  );
}
