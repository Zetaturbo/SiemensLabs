/**
 * Lists the objects of a GLB with material, triangle count and bounds in the train frame, so you can
 * fill meshNames / position / glb.carve in src/config/train-parts.json.
 *
 *   pnpm tsx src/components/train/dev/glb-names.ts public/models/train.glb
 *
 * The train frame is what the app renders: model.transform (rotationDeg, scale) from the config,
 * then centred on x/z with the lowest point on y=0. Bounds come from the POSITION accessor min/max,
 * so they are boxes, not exact hulls. In the browser, the Inspect tool (dev only) gives exact points.
 */
import { readFileSync } from "node:fs";
import { Box3, Euler, MathUtils, Matrix4, Quaternion, Vector3 } from "three";
import config from "../../../config/train-parts.json";

interface GltfNode {
  name?: string;
  mesh?: number;
  children?: number[];
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}
interface Gltf {
  scene?: number;
  scenes: Array<{ nodes: number[] }>;
  nodes: GltfNode[];
  meshes: Array<{ name?: string; primitives: Array<{ attributes: { POSITION: number }; indices?: number; material?: number }> }>;
  accessors: Array<{ count: number; min?: number[]; max?: number[] }>;
  materials?: Array<{ name?: string }>;
}

const file = process.argv[2] ?? "public/models/train.glb";
const buf = readFileSync(file);
if (buf.toString("utf8", 0, 4) !== "glTF") throw new Error(`${file} is not a binary glTF`);
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.toString("utf8", 20, 20 + jsonLen)) as Gltf;

const t = (config.model as { transform?: { rotationDeg?: number[]; scale?: number } }).transform ?? {};
const rot = t.rotationDeg ?? [0, 0, 0];
const s = t.scale ?? 1;
const fit = new Matrix4()
  .makeRotationFromEuler(new Euler(...(rot.map((d) => MathUtils.degToRad(d)) as [number, number, number])))
  .multiply(new Matrix4().makeScale(s, s, s));

const local = (n: GltfNode) =>
  n.matrix
    ? new Matrix4().fromArray(n.matrix)
    : new Matrix4().compose(
        new Vector3(...((n.translation ?? [0, 0, 0]) as [number, number, number])),
        new Quaternion(...((n.rotation ?? [0, 0, 0, 1]) as [number, number, number, number])),
        new Vector3(...((n.scale ?? [1, 1, 1]) as [number, number, number])),
      );

interface Row {
  object: string;
  path: string;
  mesh: string;
  material: string;
  triangles: number;
  box: Box3;
}
const rows: Row[] = [];
const walk = (i: number, parent: Matrix4, path: string[]) => {
  const n = gltf.nodes[i];
  const world = parent.clone().multiply(local(n));
  const here = [...path, n.name ?? `node${i}`];
  if (n.mesh != null) {
    const m = gltf.meshes[n.mesh];
    for (const p of m.primitives) {
      const a = gltf.accessors[p.attributes.POSITION];
      const box = new Box3();
      if (a.min && a.max) {
        for (let k = 0; k < 8; k++) {
          const c = new Vector3(k & 1 ? a.max[0] : a.min[0], k & 2 ? a.max[1] : a.min[1], k & 4 ? a.max[2] : a.min[2]);
          box.expandByPoint(c.applyMatrix4(world).applyMatrix4(fit));
        }
      }
      rows.push({
        object: n.name ?? `node${i}`,
        path: here.join(" / "),
        mesh: m.name ?? "",
        material: p.material != null ? (gltf.materials?.[p.material]?.name ?? String(p.material)) : "",
        triangles: Math.round((p.indices != null ? gltf.accessors[p.indices].count : a.count) / 3),
        box,
      });
    }
  }
  for (const c of n.children ?? []) walk(c, world, here);
};
for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, new Matrix4(), []);

const all = rows.reduce((b, r) => b.union(r.box), new Box3());
const off = new Vector3(-(all.min.x + all.max.x) / 2, -all.min.y, -(all.min.z + all.max.z) / 2);
const f = (v: number) => v.toFixed(2).padStart(7);
const size = all.getSize(new Vector3());
console.log(`${file}: ${rows.length} primitives, train frame size ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m (x = length, nose at +x)\n`);
console.log("object        material        tris   min x/y/z                    max x/y/z                    path");
for (const r of rows) {
  const mn = r.box.min.clone().add(off);
  const mx = r.box.max.clone().add(off);
  console.log(
    `${r.object.padEnd(13)} ${r.material.slice(0, 14).padEnd(14)} ${String(r.triangles).padStart(6)}  ${f(mn.x)}${f(mn.y)}${f(mn.z)}    ${f(mx.x)}${f(mx.y)}${f(mx.z)}    ${r.path}`,
  );
}
