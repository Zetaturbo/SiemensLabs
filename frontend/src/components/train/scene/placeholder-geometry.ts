import { BoxGeometry, BufferGeometry, CylinderGeometry, Float32BufferAttribute } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { expandZones, PARTS, type Vec3 } from "../config";

/**
 * Procedural Velaro-like train in the normalized frame (metres, rail top y=0, nose +x), sized like the
 * GLB end car so the hotspot positions in train-parts.json fit both. A second (intermediate) car trails
 * behind the end car.
 */

export const LEAD = { rear: -11.29, noseStart: 4.6, tip: 11.29 };
export const MID = { rear: -34.1, front: -11.79 };
const BOTTOM = 0.95;
const ROOF = 3.92;
const HALF_W = 1.47;
const TIP_Y = 1.32;

/** Right half of the car cross-section (z, y), bottom centre to roof centre. */
const HALF_PROFILE: Array<[number, number]> = [
  [0, BOTTOM],
  [1.22, BOTTOM],
  [1.4, 1.1],
  [1.47, 1.42],
  [1.47, 2.95],
  [1.44, 3.28],
  [1.34, 3.56],
  [1.15, 3.76],
  [0.84, 3.87],
  [0, ROOF],
];

/** Closed loop of normalized (z in -1..1, y in 0..1) profile points. */
const PROFILE: Array<[number, number]> = (() => {
  const n = HALF_PROFILE.map(([z, y]) => [z / HALF_W, (y - BOTTOM) / (ROOF - BOTTOM)] as [number, number]);
  const left = n.slice(1, -1).map(([z, y]) => [-z, y] as [number, number]).reverse();
  return [...n, ...left];
})();

interface Station {
  x: number;
  hw: number; // half width
  yb: number; // bottom
  yt: number; // top
}

function noseStation(t: number): Station {
  const x = LEAD.noseStart + (LEAD.tip - LEAD.noseStart) * t;
  const yt = TIP_Y + (ROOF - TIP_Y) * Math.pow(1 - Math.pow(t, 1.75), 0.72);
  const yb = TIP_Y - (TIP_Y - BOTTOM) * Math.pow(1 - Math.pow(t, 5), 0.5);
  const hw = HALF_W * Math.pow(1 - Math.pow(t, 3.1), 0.5);
  return { x, hw, yb, yt };
}

function ringPoint(s: Station, [zn, yn]: [number, number]): Vec3 {
  return [s.x, s.yb + yn * (s.yt - s.yb), zn * s.hw];
}

/** Loft rings of the profile through the stations, with optional fan caps. */
function loft(stations: Station[], opts: { capStart?: boolean; capEnd?: Vec3 | "flat" }): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const m = PROFILE.length;
  for (const s of stations) for (const p of PROFILE) pos.push(...ringPoint(s, p));
  for (let i = 0; i < stations.length - 1; i++) {
    for (let j = 0; j < m; j++) {
      const a = i * m + j;
      const b = i * m + ((j + 1) % m);
      const c = (i + 1) * m + j;
      const d = (i + 1) * m + ((j + 1) % m);
      idx.push(a, c, b, b, c, d);
    }
  }
  const fan = (ring: number, apex: Vec3, flip: boolean) => {
    const center = pos.length / 3;
    pos.push(...apex);
    for (let j = 0; j < m; j++) {
      const a = ring * m + j;
      const b = ring * m + ((j + 1) % m);
      if (flip) idx.push(center, a, b);
      else idx.push(center, b, a);
    }
  };
  if (opts.capStart) {
    const s = stations[0];
    fan(0, [s.x, (s.yb + s.yt) / 2, 0], true);
  }
  if (opts.capEnd) {
    const s = stations[stations.length - 1];
    fan(stations.length - 1, opts.capEnd === "flat" ? [s.x, (s.yb + s.yt) / 2, 0] : opts.capEnd, false);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const straight = (x: number): Station => ({ x, hw: HALF_W, yb: BOTTOM, yt: ROOF });

function noseStations(): Station[] {
  const out: Station[] = [];
  const n = 22;
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    out.push(noseStation(Math.min(0.992, 1 - Math.pow(1 - u, 1.6))));
  }
  return out;
}

export function leadBody(): BufferGeometry {
  const stations = [straight(LEAD.rear), ...noseStations()];
  return loft(stations, { capStart: true, capEnd: [LEAD.tip, TIP_Y, 0] });
}

export function midBody(): BufferGeometry {
  return loft([straight(MID.rear), straight(MID.front)], { capStart: true, capEnd: "flat" });
}

/** Windshield: the upper part of the nose loft between two stations, pushed out slightly. */
export function windshield(): BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  const upper = PROFILE.filter(([, y]) => y >= 0.6);
  // order the upper points from the right side over the roof to the left side
  const right = upper.filter(([z]) => z > 0).sort((a, b) => a[1] - b[1]);
  const top = upper.filter(([z]) => z === 0);
  const left = upper.filter(([z]) => z < 0).sort((a, b) => b[1] - a[1]);
  const strip = [...right, ...top, ...left];
  const ts: number[] = [];
  for (let i = 0; i <= 8; i++) ts.push(0.3 + (0.66 - 0.3) * (i / 8));
  for (const t of ts) {
    const s = noseStation(t);
    for (const p of strip) {
      const [x, y, z] = ringPoint(s, p);
      pos.push(x + 0.004, y + 0.012, z * 1.008);
    }
  }
  const m = strip.length;
  for (let i = 0; i < ts.length - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      idx.push(a, a + m, a + 1, a + 1, a + m, a + m + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function box(min: Vec3, max: Vec3): BufferGeometry {
  const g = new BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return g;
}

function boxAt(size: Vec3, center: Vec3, rotZ = 0): BufferGeometry {
  const g = new BoxGeometry(...size);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(...center);
  return g;
}

function cyl(axis: "x" | "y" | "z", r: number, h: number, center: Vec3, seg = 24): BufferGeometry {
  const g = new CylinderGeometry(r, r, h, seg);
  if (axis === "z") g.rotateX(Math.PI / 2);
  if (axis === "x") g.rotateZ(Math.PI / 2);
  g.translate(...center);
  return g;
}

/** Bar between two points in the x/y plane at depth z. */
function bar(a: [number, number], b: [number, number], z: number, t = 0.06): BufferGeometry {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return boxAt([Math.hypot(dx, dy), t, t], [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z], Math.atan2(dy, dx));
}

const merge = (gs: BufferGeometry[]) => {
  const g = mergeGeometries(gs, false);
  gs.forEach((x) => x.dispose());
  if (!g) throw new Error("placeholder: could not merge geometries");
  return g;
};

/** Bogie and axle positions follow the GLB end car (wheel radius 0.55). */
const WHEEL_R = 0.55;
const LEAD_BOGIES = [
  { x: -8.25, axles: [-9.75, -6.75], motor: false },
  { x: 6.05, axles: [4.55, 7.55], motor: true },
];
const MID_BOGIES = [
  { x: -14.3, axles: [-15.8, -12.8], motor: false },
  { x: -31.6, axles: [-33.1, -30.1], motor: true },
];
const BOGIES = [...LEAD_BOGIES, ...MID_BOGIES];

export function bogieFrames(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (const b of BOGIES) {
    for (const z of [-1.0, 1.0]) gs.push(boxAt([3.9, 0.26, 0.16], [b.x, 0.78, z]));
    gs.push(boxAt([0.5, 0.24, 2.16], [b.x, 0.76, 0]));
    for (const ax of b.axles) {
      for (const z of [-0.72, 0.72]) gs.push(cyl("z", WHEEL_R, 0.13, [ax, WHEEL_R, z], 32));
      gs.push(cyl("z", 0.08, 2.2, [ax, WHEEL_R, 0], 12));
      for (const z of [-1.0, 1.0]) {
        gs.push(boxAt([0.36, 0.22, 0.22], [ax, WHEEL_R, z]));
        gs.push(cyl("y", 0.1, 0.2, [ax + (ax < b.x ? 0.38 : -0.38), 0.98, z], 12));
      }
    }
  }
  return merge(gs);
}

export function brakes(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (const b of BOGIES) {
    for (const ax of b.axles) {
      const zs = b.motor ? [-0.6, 0.6] : [-0.38, 0, 0.38];
      for (const z of zs) {
        gs.push(cyl("z", b.motor ? 0.38 : 0.34, 0.07, [ax, WHEEL_R, z], 28));
        gs.push(boxAt([0.16, 0.24, 0.14], [ax + (ax < b.x ? 0.42 : -0.42), WHEEL_R, z]));
      }
    }
  }
  return merge(gs);
}

export function motors(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (const b of BOGIES.filter((x) => x.motor)) {
    for (const ax of b.axles) {
      const mx = ax + (ax < b.x ? 0.72 : -0.72);
      gs.push(cyl("z", 0.24, 0.78, [mx, 0.5, -0.05], 20));
      gs.push(boxAt([0.42, 0.36, 0.22], [ax + (ax < b.x ? 0.3 : -0.3), 0.5, 0.48]));
    }
  }
  return merge(gs);
}

export function pantograph(): BufferGeometry {
  const x0 = -9.6;
  const gs: BufferGeometry[] = [
    boxAt([1.7, 0.1, 1.3], [-9.0, ROOF + 0.2, 0]),
    ...[-0.55, 0.55].flatMap((z) => [cyl("y", 0.07, 0.16, [-9.7, ROOF + 0.08, z], 12), cyl("y", 0.07, 0.16, [-8.3, ROOF + 0.08, z], 12)]),
  ];
  for (const z of [-0.32, 0.32]) {
    gs.push(bar([x0, ROOF + 0.28], [-8.45, 4.86], z, 0.07));
    gs.push(bar([-8.45, 4.86], [-9.15, 5.33], z, 0.05));
  }
  gs.push(boxAt([0.08, 0.06, 0.7], [-8.45, 4.86, 0]));
  gs.push(boxAt([0.14, 0.05, 1.6], [-9.15, 5.37, 0]));
  for (const z of [-0.8, 0.8]) gs.push(bar([-9.15, 5.37], [-9.15, 5.25], z * 1.12, 0.04));
  gs.push(cyl("x", 0.08, 0.5, [x0 - 0.1, ROOF + 0.32, 0], 12));
  return merge(gs);
}

export function windows(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  const add = (from: number, to: number, skip: Array<[number, number]>) => {
    for (let x = from; x <= to; x += 1.32) {
      if (skip.some(([a, b]) => x + 0.5 > a && x - 0.5 < b)) continue;
      for (const z of [-1, 1]) gs.push(boxAt([0.95, 0.72, 0.03], [x, 2.5, z * (HALF_W + 0.006)]));
    }
  };
  add(-10.3, 3.9, []);
  add(-33.2, -12.6, [[-33.9, -32.2], [-14.1, -12.3]]);
  return merge(gs);
}

export function midDoors(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (const x of [-33.1, -13.25])
    for (const z of [-1, 1]) {
      gs.push(boxAt([1.3, 2.0, 0.012], [x, 2.05, z * (HALF_W + 0.008)]));
      gs.push(boxAt([0.02, 2.0, 0.016], [x, 2.05, z * (HALF_W + 0.01)]));
    }
  return merge(gs);
}

export function leadDoorSplits(): BufferGeometry {
  return merge([-1, 1].map((z) => boxAt([0.02, 1.8, 0.016], [5.48, 2.2, z * (HALF_W + 0.01)])));
}

export function hvac(): BufferGeometry {
  return merge([
    box([-6.7, 3.9, -0.95], [-4.9, 4.25, 0.95]),
    cyl("y", 0.3, 0.05, [-6.2, 4.27, 0], 28),
    cyl("y", 0.3, 0.05, [-5.4, 4.27, 0], 28),
    box([-24.6, 3.92, -0.85], [-21.8, 4.3, 0.85]),
    cyl("y", 0.32, 0.05, [-23.9, 4.32, 0], 28),
    cyl("y", 0.32, 0.05, [-22.5, 4.32, 0], 28),
  ]);
}

export function gangway(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (let i = 0; i < 4; i++) {
    const x = LEAD.rear - 0.06 - i * 0.12;
    gs.push(box([x - 0.03, 1.15, -0.95], [x + 0.03, 3.45, 0.95]));
  }
  gs.push(box([LEAD.rear - 0.5, 0.9, -0.12], [LEAD.rear, 1.12, 0.12]));
  gs.push(box([LEAD.tip - 1.25, 0.82, -0.3], [LEAD.tip - 0.55, 1.08, 0.3]));
  return merge(gs);
}

export function midSeats(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (let x = -32.0; x <= -14.4; x += 1.0) {
    for (const [z0, z1] of [[0.25, 1.25], [-1.25, -0.25]] as Array<[number, number]>) {
      gs.push(box([x, 1.2, z0], [x + 0.45, 2.35, z1]));
    }
  }
  gs.push(box([-32.5, 3.18, -0.12], [-13.8, 3.22, 0.12]));
  return merge(gs);
}

/** Config outline boxes rendered as solid boxes for parts the placeholder has no custom geometry for. */
export function zoneBoxes(partId: string): BufferGeometry | null {
  const part = PARTS.find((p) => p.id === partId);
  const zones = expandZones(part?.glb?.outline);
  if (!zones.length) return null;
  return merge(zones.map((z) => box(z.min, z.max)));
}

export function rails(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (const z of [-0.7175, 0.7175]) {
    gs.push(box([-46, -0.15, z - 0.036], [22, 0, z + 0.036]));
  }
  return merge(gs);
}

export function sleepers(): BufferGeometry {
  const gs: BufferGeometry[] = [];
  for (let x = -45.7; x < 22; x += 0.65) gs.push(box([x - 0.13, -0.32, -1.3], [x + 0.13, -0.15, 1.3]));
  return merge(gs);
}

export const CONTACT_WIRE_Y = 5.45;
