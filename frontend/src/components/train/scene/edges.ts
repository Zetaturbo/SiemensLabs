import { BufferGeometry, Float32BufferAttribute, Vector3, type Matrix4 } from "three";
import type { Vec3 } from "../config";

/**
 * Line segments for the blueprint drawing, with the normals of the (up to) two faces that meet at each edge.
 * The line shader uses the normals to tell silhouette edges (one face towards the camera, one away) from
 * interior seams (both faces towards the camera) and draws the silhouette slightly stronger. Edges with
 * zero normals (outline boxes, wires) are drawn at full weight.
 */
export interface EdgeSet {
  /** Segment end points, xyz xyz per segment. */
  positions: Float32Array;
  /** Normal of the first face per segment (xyz), zero when unknown. */
  na: Float32Array;
  /** Normal of the second face per segment (xyz), zero for open boundary edges. */
  nb: Float32Array;
}

export const EMPTY_EDGES: EdgeSet = { positions: new Float32Array(0), na: new Float32Array(0), nb: new Float32Array(0) };

export const edgeCount = (e: EdgeSet) => e.positions.length / 6;

const PRECISION = 1e4;
const key = (x: number, y: number, z: number) => `${Math.round(x * PRECISION)},${Math.round(y * PRECISION)},${Math.round(z * PRECISION)}`;

/**
 * Crease and boundary edges of a triangle soup (flat xyz per vertex, three vertices per triangle), like
 * three's EdgesGeometry but keeping both face normals. Vertices are matched by position, so unwelded
 * meshes work. `thresholdDeg` is the minimum angle between face normals for an edge to be drawn.
 */
export function creaseEdges(tris: ArrayLike<number>, thresholdDeg: number): EdgeSet {
  const cos = Math.cos((thresholdDeg * Math.PI) / 180);
  type Open = { i: number; j: number; n: Vec3 };
  const open = new Map<string, Open | null>();
  const out: number[] = [];
  const na: number[] = [];
  const nb: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const keys = ["", "", ""];
  for (let t = 0; t + 8 < tris.length; t += 9) {
    a.set(tris[t], tris[t + 1], tris[t + 2]);
    b.set(tris[t + 3], tris[t + 4], tris[t + 5]);
    c.set(tris[t + 6], tris[t + 7], tris[t + 8]);
    const n = c.clone().sub(b).cross(a.clone().sub(b));
    if (n.lengthSq() < 1e-14) continue;
    n.normalize();
    keys[0] = key(a.x, a.y, a.z);
    keys[1] = key(b.x, b.y, b.z);
    keys[2] = key(c.x, c.y, c.z);
    if (keys[0] === keys[1] || keys[1] === keys[2] || keys[2] === keys[0]) continue;
    for (let e = 0; e < 3; e++) {
      const i = t + e * 3;
      const j = t + ((e + 1) % 3) * 3;
      const k = `${keys[e]}_${keys[(e + 1) % 3]}`;
      const rk = `${keys[(e + 1) % 3]}_${keys[e]}`;
      const other = open.get(rk);
      if (other) {
        if (n.x * other.n[0] + n.y * other.n[1] + n.z * other.n[2] <= cos) {
          out.push(tris[other.i], tris[other.i + 1], tris[other.i + 2], tris[other.j], tris[other.j + 1], tris[other.j + 2]);
          na.push(...other.n);
          nb.push(n.x, n.y, n.z);
        }
        open.set(rk, null);
      } else if (!open.has(k)) {
        open.set(k, { i, j, n: [n.x, n.y, n.z] });
      }
    }
  }
  // edges with only one face: the rim of an open mesh
  for (const o of open.values()) {
    if (!o) continue;
    out.push(tris[o.i], tris[o.i + 1], tris[o.i + 2], tris[o.j], tris[o.j + 1], tris[o.j + 2]);
    na.push(...o.n);
    nb.push(0, 0, 0);
  }
  return { positions: new Float32Array(out), na: new Float32Array(na), nb: new Float32Array(nb) };
}

/** Triangle soup (flat xyz) of a geometry, optionally transformed. */
export function triangleSoup(geo: BufferGeometry, matrix?: Matrix4): Float32Array {
  const pos = geo.attributes.position;
  const index = geo.index;
  const n = index ? index.count : pos.count;
  const out = new Float32Array(n * 3);
  const v = new Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, index ? index.getX(i) : i);
    if (matrix) v.applyMatrix4(matrix);
    out[i * 3] = v.x;
    out[i * 3 + 1] = v.y;
    out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Segments without face normals (outline boxes, wires): always drawn at full weight. */
export function plainEdges(positions: ArrayLike<number>): EdgeSet {
  const p = Float32Array.from(positions);
  return { positions: p, na: new Float32Array(p.length / 2), nb: new Float32Array(p.length / 2) };
}

export function mergeEdges(list: EdgeSet[]): EdgeSet {
  const len = (k: keyof EdgeSet) => list.reduce((s, e) => s + e[k].length, 0);
  const out: EdgeSet = { positions: new Float32Array(len("positions")), na: new Float32Array(len("na")), nb: new Float32Array(len("nb")) };
  const at = { positions: 0, na: 0, nb: 0 };
  for (const e of list)
    for (const k of ["positions", "na", "nb"] as const) {
      out[k].set(e[k], at[k]);
      at[k] += e[k].length;
    }
  return out;
}

/** Segments whose midpoint passes `keep`. */
export function filterEdges(e: EdgeSet, keep: (x: number, y: number, z: number) => boolean): EdgeSet {
  const p: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let s = 0; s < edgeCount(e); s++) {
    const i = s * 6;
    if (!keep((e.positions[i] + e.positions[i + 3]) / 2, (e.positions[i + 1] + e.positions[i + 4]) / 2, (e.positions[i + 2] + e.positions[i + 5]) / 2)) continue;
    for (let k = 0; k < 6; k++) p.push(e.positions[i + k]);
    for (let k = 0; k < 3; k++) {
      a.push(e.na[s * 3 + k]);
      b.push(e.nb[s * 3 + k]);
    }
  }
  return { positions: new Float32Array(p), na: new Float32Array(a), nb: new Float32Array(b) };
}

/** One part from several procedural pieces: a single fill geometry and a single edge set (fewer draw calls). */
export function partFromPieces(pieces: Array<{ geometry: BufferGeometry; threshold?: number }>): { fill: BufferGeometry | null; edges: EdgeSet } {
  const soups = pieces.map((p) => triangleSoup(p.geometry));
  const edges = mergeEdges(pieces.map((p, i) => creaseEdges(soups[i], p.threshold ?? 12)));
  const total = soups.reduce((n, s) => n + s.length, 0);
  if (!total) return { fill: null, edges };
  const all = new Float32Array(total);
  let at = 0;
  for (const s of soups) {
    all.set(s, at);
    at += s.length;
  }
  const fill = new BufferGeometry();
  fill.setAttribute("position", new Float32BufferAttribute(all, 3));
  fill.computeVertexNormals();
  fill.computeBoundingSphere();
  return { fill, edges };
}
