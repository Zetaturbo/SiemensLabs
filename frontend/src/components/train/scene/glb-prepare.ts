import {
  Box3,
  BufferGeometry,
  EdgesGeometry,
  Euler,
  Float32BufferAttribute,
  MathUtils,
  Matrix4,
  Vector3,
  type Mesh,
  type Object3D,
} from "three";
import { expandZones, MODEL, PARTS, type ModelConfig, type TrainPart, type Vec3 } from "../config";
import { boxSegments } from "./blueprint";

export const BASE_KEY = "__base";

export interface PreparedPart {
  /** Fill triangles in the normalized frame (non-indexed). */
  fill: BufferGeometry | null;
  /** Source object name per fill triangle, for the inspector. */
  faceNames: string[];
  /** Line segment pairs (x,y,z,x,y,z) in the normalized frame. */
  lines: number[];
}

export interface MeshInfo {
  name: string;
  path: string;
  material: string;
  triangles: number;
  part: string;
  center: Vec3;
  size: Vec3;
}

export interface PreparedGlb {
  parts: Record<string, PreparedPart>;
  meshes: MeshInfo[];
  size: Vec3;
}

const round = (v: number) => Math.round(v * 100) / 100;

function pathOf(o: Object3D): string {
  const names: string[] = [];
  for (let x: Object3D | null = o; x; x = x.parent) if (x.name) names.unshift(x.name);
  return names.join(" / ");
}

/**
 * Turns the loaded GLB into per-part blueprint geometry in the normalized train frame:
 * rotate and scale per model.transform, then centre on x/z and put the lowest point on y=0.
 * Triangles and crease edges go to a part by (1) glb.carve boxes, (2) meshNames on the object or an
 * ancestor, otherwise to the structural base. glb.outline boxes are added as part-coloured lines.
 */
export function prepareGlb(scene: Object3D, parts: TrainPart[], model: ModelConfig): PreparedGlb {
  const rot = model.transform?.rotationDeg ?? [0, 0, 0];
  const scale = model.transform?.scale ?? 1;
  const threshold = model.edgeThresholdDeg ?? 18;

  scene.updateMatrixWorld(true);
  const rs = new Matrix4()
    .makeRotationFromEuler(new Euler(MathUtils.degToRad(rot[0]), MathUtils.degToRad(rot[1]), MathUtils.degToRad(rot[2])))
    .multiply(new Matrix4().makeScale(scale, scale, scale));

  const meshes: Mesh[] = [];
  scene.traverse((o) => {
    if ((o as Mesh).isMesh && (o as Mesh).geometry?.attributes.position) meshes.push(o as Mesh);
  });

  // bounds after rotation and scale, to centre the model
  const bounds = new Box3();
  const tmpBox = new Box3();
  const m = new Matrix4();
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    tmpBox.copy(mesh.geometry.boundingBox!).applyMatrix4(m.multiplyMatrices(rs, mesh.matrixWorld));
    bounds.union(tmpBox);
  }
  const offset = new Matrix4().makeTranslation(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  const norm = offset.multiply(rs);
  const size = bounds.getSize(new Vector3());

  const carve = parts.flatMap((p) => expandZones(p.glb?.carve).map((z) => ({ id: p.id, box: new Box3(new Vector3(...z.min), new Vector3(...z.max)) })));
  const byName = new Map<string, string>();
  for (const p of parts) for (const n of p.meshNames) byName.set(n, p.id);

  const meshPart = (o: Object3D): string | null => {
    for (let x: Object3D | null = o; x; x = x.parent) {
      const id = byName.get(x.name);
      if (id) return id;
    }
    return null;
  };
  const carvePart = (p: Vector3): string | null => carve.find((c) => c.box.containsPoint(p))?.id ?? null;

  const fills: Record<string, number[]> = {};
  const names: Record<string, string[]> = {};
  const lines: Record<string, number[]> = {};
  const push = (rec: Record<string, number[]>, key: string, ...v: number[]) => (rec[key] ??= []).push(...v);

  const info: MeshInfo[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const mid = new Vector3();

  for (const mesh of meshes) {
    const w = new Matrix4().multiplyMatrices(norm, mesh.matrixWorld);
    const own = meshPart(mesh);
    const fallback = own ?? BASE_KEY;
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const triCount = index ? index.count / 3 : pos.count / 3;
    const label = mesh.name || "(unnamed)";

    const mbox = new Box3();
    for (let t = 0; t < triCount; t++) {
      const i0 = index ? index.getX(t * 3) : t * 3;
      const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
      const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(w);
      b.fromBufferAttribute(pos, i1).applyMatrix4(w);
      c.fromBufferAttribute(pos, i2).applyMatrix4(w);
      mbox.expandByPoint(a).expandByPoint(b).expandByPoint(c);
      mid.copy(a).add(b).add(c).divideScalar(3);
      const key = carvePart(mid) ?? fallback;
      push(fills, key, a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      (names[key] ??= []).push(label);
    }

    const edges = new EdgesGeometry(mesh.geometry, threshold);
    const ep = edges.attributes.position;
    for (let i = 0; i < ep.count; i += 2) {
      a.fromBufferAttribute(ep, i).applyMatrix4(w);
      b.fromBufferAttribute(ep, i + 1).applyMatrix4(w);
      mid.copy(a).add(b).multiplyScalar(0.5);
      const key = carvePart(mid) ?? fallback;
      push(lines, key, a.x, a.y, a.z, b.x, b.y, b.z);
    }
    edges.dispose();

    const ctr = mbox.getCenter(new Vector3());
    const sz = mbox.getSize(new Vector3());
    const mat = Array.isArray(mesh.material) ? mesh.material.map((x) => x.name).join(",") : mesh.material?.name ?? "";
    info.push({
      name: label,
      path: pathOf(mesh),
      material: mat,
      triangles: triCount,
      part: own ?? "",
      center: [round(ctr.x), round(ctr.y), round(ctr.z)],
      size: [round(sz.x), round(sz.y), round(sz.z)],
    });
  }

  for (const p of parts) {
    const outline = expandZones(p.glb?.outline);
    if (outline.length) push(lines, p.id, ...boxSegments(outline));
  }

  const out: Record<string, PreparedPart> = {};
  for (const key of new Set([...Object.keys(fills), ...Object.keys(lines)])) {
    let fill: BufferGeometry | null = null;
    if (fills[key]?.length) {
      fill = new BufferGeometry();
      fill.setAttribute("position", new Float32BufferAttribute(fills[key], 3));
      fill.computeBoundingSphere();
    }
    out[key] = { fill, faceNames: names[key] ?? [], lines: lines[key] ?? [] };
  }
  return { parts: out, meshes: info, size: [round(size.x), round(size.y), round(size.z)] };
}

const preparedCache = new WeakMap<Object3D, PreparedGlb>();

/**
 * prepareGlb for the configured parts and model, computed once per loaded scene (useGLTF caches the scene per
 * URL), so the train map and every part thumbnail share one result. Its geometry lives as long as the page.
 */
export function preparedGlb(scene: Object3D): PreparedGlb {
  let p = preparedCache.get(scene);
  if (!p) {
    p = prepareGlb(scene, PARTS, MODEL);
    preparedCache.set(scene, p);
  }
  return p;
}
