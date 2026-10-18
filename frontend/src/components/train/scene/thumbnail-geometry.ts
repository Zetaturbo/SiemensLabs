import { Box3, BufferGeometry, Float32BufferAttribute, Vector3 } from "three";
import { PART_BY_ID, type Vec3 } from "../config";
import { creaseEdges, EMPTY_EDGES, edgeCount, filterEdges, mergeEdges, triangleSoup, type EdgeSet } from "./edges";
import type { PreparedGlb } from "./glb-prepare";

/** Fill triangles (flat xyz, three vertices each) plus edges, in the train frame. */
export interface ThumbGeometry {
  fill: number[];
  edges: EdgeSet;
}

export interface ThumbScene {
  part: ThumbGeometry;
  /** Faint surroundings inside the crop sphere (empty when the part has no crop). */
  context: EdgeSet;
}

/** The shell and the unassigned structure would only add noise around a cropped part. */
const SKIP_CONTEXT = new Set(["car_body", "__base", "interiors"]);

const inSphere = (x: number, y: number, z: number, c: Vec3 | null, r: number) =>
  !c || (x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2 <= r * r;

/** Triangles of a soup whose centroid lies in the sphere. */
function cropTriangles(soup: ArrayLike<number>, c: Vec3 | null, r: number, out: number[]) {
  for (let t = 0; t + 8 < soup.length; t += 9) {
    const cx = (soup[t] + soup[t + 3] + soup[t + 6]) / 3;
    const cy = (soup[t + 1] + soup[t + 4] + soup[t + 7]) / 3;
    const cz = (soup[t + 2] + soup[t + 5] + soup[t + 8]) / 3;
    if (!inSphere(cx, cy, cz, c, r)) continue;
    for (let k = 0; k < 9; k++) out.push(soup[t + k]);
  }
}

const crop = (partId: string): { center: Vec3 | null; radius: number } => {
  const p = PART_BY_ID[partId];
  const r = p?.thumbnail?.cropRadius;
  return r ? { center: p.position, radius: r } : { center: null, radius: Infinity };
};

const cropEdges = (e: EdgeSet, c: Vec3 | null, r: number) => (c ? filterEdges(e, (x, y, z) => inSphere(x, y, z, c, r)) : e);

/** The part from the prepared GLB, cropped to its thumbnail sphere, with the rest of the model as context. */
export function thumbFromGlb(prepared: PreparedGlb, partId: string): ThumbScene | null {
  const data = prepared.parts[partId];
  if (!data?.fill) return null; // outline-only parts read better from the procedural geometry
  const { center, radius } = crop(partId);
  const fill: number[] = [];
  cropTriangles(data.fill.attributes.position.array, center, radius, fill);
  const part = { fill, edges: cropEdges(data.edges, center, radius) };
  const context = center
    ? mergeEdges(Object.entries(prepared.parts).filter(([k]) => k !== partId && !SKIP_CONTEXT.has(k)).map(([, o]) => cropEdges(o.edges, center, radius)))
    : EMPTY_EDGES;
  return fill.length || edgeCount(part.edges) ? { part, context } : null;
}

/** The part from the procedural placeholder pieces (geometry plus crease threshold per piece). */
export function thumbFromPieces(pieces: Record<string, Array<{ geometry: BufferGeometry; threshold?: number }>>, partId: string): ThumbScene | null {
  const own = pieces[partId];
  if (!own?.length) return null;
  const { center, radius } = crop(partId);
  const fill: number[] = [];
  const edges: EdgeSet[] = [];
  for (const p of own) {
    const soup = triangleSoup(p.geometry);
    cropTriangles(soup, center, radius, fill);
    edges.push(cropEdges(creaseEdges(soup, p.threshold ?? 12), center, radius));
  }
  const context: EdgeSet[] = [];
  if (center)
    for (const [key, list] of Object.entries(pieces)) {
      if (key === partId || SKIP_CONTEXT.has(key)) continue;
      for (const p of list) context.push(cropEdges(creaseEdges(triangleSoup(p.geometry), p.threshold ?? 12), center, radius));
    }
  const part = { fill, edges: mergeEdges(edges) };
  return fill.length || edgeCount(part.edges) ? { part, context: mergeEdges(context) } : null;
}

export function fillGeometry(fill: number[]): BufferGeometry | null {
  if (!fill.length) return null;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(fill, 3));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Bounds of the part (fill and edges), used to frame the thumbnail. */
export function thumbBounds(g: ThumbGeometry): Box3 {
  const b = new Box3();
  const v = new Vector3();
  for (const arr of [g.fill, g.edges.positions]) for (let i = 0; i + 2 < arr.length; i += 3) b.expandByPoint(v.set(arr[i], arr[i + 1], arr[i + 2]));
  return b;
}
