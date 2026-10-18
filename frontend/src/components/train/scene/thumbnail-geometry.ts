import { Box3, BufferGeometry, EdgesGeometry, Float32BufferAttribute, Vector3 } from "three";
import { PART_BY_ID, type Vec3 } from "../config";
import type { PreparedGlb } from "./glb-prepare";

/** Line segment pairs plus optional fill triangles (both flat xyz arrays in the train frame). */
export interface ThumbGeometry {
  fill: number[];
  lines: number[];
}

export interface ThumbScene {
  part: ThumbGeometry;
  /** Faint surroundings inside the crop sphere (empty when the part has no crop). */
  context: ThumbGeometry;
}

/** The shell and the unassigned structure would only add noise around a cropped part. */
const SKIP_CONTEXT = new Set(["car_body", "__base", "interiors"]);

const inSphere = (x: number, y: number, z: number, c: Vec3 | null, r: number) =>
  !c || (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2 <= r * r;

/** Triangles of a geometry (indexed or not) whose centroid lies in the sphere, as a flat array. */
function triangles(geo: BufferGeometry, c: Vec3 | null, r: number, out: number[]) {
  const pos = geo.attributes.position;
  const index = geo.index;
  const n = index ? index.count : pos.count;
  for (let t = 0; t < n; t += 3) {
    const ids = [0, 1, 2].map((k) => (index ? index.getX(t + k) : t + k));
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const i of ids) {
      cx += pos.getX(i) / 3;
      cy += pos.getY(i) / 3;
      cz += pos.getZ(i) / 3;
    }
    if (!inSphere(cx, cy, cz, c, r)) continue;
    for (const i of ids) out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
}

/** Segment pairs whose midpoint lies in the sphere. */
function segments(points: ArrayLike<number>, c: Vec3 | null, r: number, out: number[]) {
  for (let i = 0; i + 5 < points.length; i += 6) {
    const mx = (points[i] + points[i + 3]) / 2;
    const my = (points[i + 1] + points[i + 4]) / 2;
    const mz = (points[i + 2] + points[i + 5]) / 2;
    if (inSphere(mx, my, mz, c, r)) for (let k = 0; k < 6; k++) out.push(points[i + k]);
  }
}

function edgesOf(geo: BufferGeometry, thresholdDeg: number): ArrayLike<number> {
  const e = new EdgesGeometry(geo, thresholdDeg);
  const arr = e.attributes.position.array as Float32Array;
  e.dispose();
  return arr;
}

const crop = (partId: string): { center: Vec3 | null; radius: number } => {
  const p = PART_BY_ID[partId];
  const r = p?.thumbnail?.cropRadius;
  return r ? { center: p.position, radius: r } : { center: null, radius: Infinity };
};

/** The part from the prepared GLB, cropped to its thumbnail sphere, with the rest of the model as context. */
export function thumbFromGlb(prepared: PreparedGlb, partId: string): ThumbScene | null {
  const data = prepared.parts[partId];
  if (!data || !data.fill) return null; // outline-only parts read better from the procedural geometry
  const { center, radius } = crop(partId);
  const part: ThumbGeometry = { fill: [], lines: [] };
  if (data.fill) triangles(data.fill, center, radius, part.fill);
  segments(data.lines, center, radius, part.lines);
  const context: ThumbGeometry = { fill: [], lines: [] };
  if (center) for (const [key, other] of Object.entries(prepared.parts)) if (!SKIP_CONTEXT.has(key) && key !== partId) segments(other.lines, center, radius, context.lines);
  return part.fill.length || part.lines.length ? { part, context } : null;
}

/** The part from the procedural placeholder pieces (geometry plus crease threshold per piece). */
export function thumbFromPieces(pieces: Record<string, Array<{ geometry: BufferGeometry; threshold?: number }>>, partId: string): ThumbScene | null {
  const own = pieces[partId];
  if (!own?.length) return null;
  const { center, radius } = crop(partId);
  const part: ThumbGeometry = { fill: [], lines: [] };
  for (const p of own) {
    triangles(p.geometry, center, radius, part.fill);
    segments(edgesOf(p.geometry, p.threshold ?? 12), center, radius, part.lines);
  }
  const context: ThumbGeometry = { fill: [], lines: [] };
  if (center)
    for (const [key, list] of Object.entries(pieces)) {
      if (key === partId || SKIP_CONTEXT.has(key)) continue;
      for (const p of list) segments(edgesOf(p.geometry, p.threshold ?? 12), center, radius, context.lines);
    }
  return part.fill.length || part.lines.length ? { part, context } : null;
}

export function fillGeometry(fill: number[]): BufferGeometry | null {
  if (!fill.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(fill, 3));
  g.computeBoundingSphere();
  return g;
}

/** Bounds of the part (fill and lines), used to frame the thumbnail. */
export function thumbBounds(g: ThumbGeometry): Box3 {
  const b = new Box3();
  const v = new Vector3();
  for (const arr of [g.fill, g.lines]) for (let i = 0; i + 2 < arr.length; i += 3) b.expandByPoint(v.set(arr[i], arr[i + 1], arr[i + 2]));
  return b;
}
