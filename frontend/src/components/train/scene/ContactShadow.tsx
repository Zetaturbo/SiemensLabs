"use client";
import { useEffect, useMemo } from "react";
import { DataTexture, LinearFilter, RGBAFormat } from "three";
import { usePalette } from "../palette";
import { useTrainUi } from "../store";

/** Height of the track bed (the grid plane) in the train frame. */
export const BED_Y = -0.33;

/**
 * A soft elongated blob, computed per pixel (no canvas filters, which not every renderer supports):
 * a rounded-rectangle distance with a smooth falloff and a denser core under the car body. Alpha only.
 */
function shadowTexture(): DataTexture {
  const w = 256;
  const h = 64;
  const data = new Uint8Array(w * h * 4);
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const u = Math.abs(((x + 0.5) / w) * 2 - 1);
      const v = Math.abs(((y + 0.5) / h) * 2 - 1);
      // superellipse: flat along the car, rounded at the ends
      const d = Math.pow(Math.pow(u, 8) + Math.pow(v, 2.2), 1 / 2.2);
      const a = 0.55 * (1 - smooth(0.3, 1, d)) + 0.45 * (1 - smooth(0.05, 0.55, d));
      const i = (y * w + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(a * 255);
      data[i + 3] = 255;
    }
  const t = new DataTexture(data, w, h, RGBAFormat);
  t.magFilter = LinearFilter;
  t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

/**
 * Soft contact shadow under the train on the track bed: one textured plane sized to the model bounds,
 * cheaper and steadier than rendering a depth shadow every frame.
 */
export function ContactShadow() {
  const palette = usePalette();
  const bounds = useTrainUi((s) => s.bounds);
  const texture = useMemo(() => shadowTexture(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  if (!bounds) return null;
  const sx = (bounds.max[0] - bounds.min[0]) * 1.06;
  const sz = (bounds.max[2] - bounds.min[2]) * 1.5;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;
  return (
    <mesh position={[cx, BED_Y + 0.004, cz]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={-2} raycast={() => null}>
      <planeGeometry args={[sx, sz]} />
      <meshBasicMaterial color={palette.shadow} alphaMap={texture} transparent opacity={palette.shadowAlpha} depthWrite={false} />
    </mesh>
  );
}
