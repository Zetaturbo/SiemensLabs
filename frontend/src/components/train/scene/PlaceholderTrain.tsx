"use client";
import { useEffect, useMemo } from "react";
import type { BufferGeometry } from "three";
import { DEFAULT_ANCHORS, useTrainUi } from "../store";
import { BlueprintPart } from "./blueprint";
import { partFromPieces } from "./edges";
import { PartGroup, usePartVisual } from "./PartGroup";
import * as G from "./placeholder-geometry";
import { useReportBounds } from "./useReportBounds";

export interface Piece {
  geometry: BufferGeometry;
  threshold?: number;
}

/** Which procedural pieces make up each part (new geometry each call; the caller disposes it). */
export function buildPieces(): Record<string, Piece[]> {
  const zone = (id: string): Piece[] => {
    const g = G.zoneBoxes(id);
    return g ? [{ geometry: g }] : [];
  };
  return {
    car_body: [{ geometry: G.leadBody(), threshold: 14 }, { geometry: G.midBody(), threshold: 14 }, { geometry: G.windows() }],
    cab_hmi: [{ geometry: G.windshield(), threshold: 30 }, ...zone("cab_hmi")],
    doors: [...zone("doors"), { geometry: G.leadDoorSplits() }, { geometry: G.midDoors() }],
    bogie_wheelsets: [{ geometry: G.bogieFrames(), threshold: 25 }],
    brake_system: [{ geometry: G.brakes(), threshold: 25 }],
    traction_motors: [{ geometry: G.motors(), threshold: 25 }],
    traction_converter: zone("traction_converter"),
    battery_aux: zone("battery_aux"),
    train_control: zone("train_control"),
    hvac: [{ geometry: G.hvac(), threshold: 25 }],
    couplers: [{ geometry: G.gangway() }],
    pantograph: [{ geometry: G.pantograph(), threshold: 25 }],
    interiors: [...zone("interiors"), { geometry: G.midSeats() }],
  };
}

function PlaceholderPart({ partId, pieces }: { partId: string; pieces: Piece[] }) {
  const visual = usePartVisual(partId);
  const merged = useMemo(() => partFromPieces(pieces), [pieces]);
  useEffect(() => () => merged.fill?.dispose(), [merged]);
  return (
    <PartGroup partId={partId}>
      <BlueprintPart fill={merged.fill} edges={merged.edges} visual={visual} />
    </PartGroup>
  );
}

/** Procedural blueprint train used when /models/train.glb is missing or fails to load. */
export function PlaceholderTrain() {
  const pieces = useMemo(() => buildPieces(), []);
  const setAnchors = useTrainUi((s) => s.setAnchors);
  const boundsRef = useReportBounds();
  useEffect(() => {
    setAnchors(DEFAULT_ANCHORS);
    return () => {
      for (const list of Object.values(pieces)) list.forEach((p) => p.geometry.dispose());
    };
  }, [pieces, setAnchors]);

  return (
    <group ref={boundsRef}>
      {Object.entries(pieces).map(([partId, list]) => (
        <PlaceholderPart key={partId} partId={partId} pieces={list} />
      ))}
    </group>
  );
}
