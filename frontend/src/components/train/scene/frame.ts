import { Box3, PerspectiveCamera, Vector3 } from "three";
import type { Vec3 } from "../config";

export type Pose = { position: Vec3; target: Vec3 };

/** Pixels kept clear of the train in the overview: search and filters on top, controls and legend below. */
export const OVERVIEW_INSET = { top: 64, bottom: 64, left: 40, right: 40 };

const corners = (b: Box3) =>
  Array.from({ length: 8 }, (_, i) => new Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));

/**
 * Overview pose that fits the train's bounds into the canvas, keeping `inset` pixels clear, seen from the
 * direction of `from` (camera minus target). Iterates the target offset and distance a few times, since
 * perspective makes the projected box asymmetric.
 */
export function fitPose(bounds: { min: Vec3; max: Vec3 }, from: Pose, fov: number, width: number, height: number, inset = OVERVIEW_INSET): Pose {
  const box = new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max));
  const pts = corners(box);
  const dir = new Vector3(...from.position).sub(new Vector3(...from.target)).normalize();
  const target = box.getCenter(new Vector3());
  const cam = new PerspectiveCamera(fov, width / height, 0.1, 1000);
  const right = new Vector3();
  const up = new Vector3();
  const p = new Vector3();
  // allowed NDC window
  const ax0 = -1 + (2 * inset.left) / width;
  const ax1 = 1 - (2 * inset.right) / width;
  const ay0 = -1 + (2 * inset.bottom) / height;
  const ay1 = 1 - (2 * inset.top) / height;
  let distance = box.getSize(new Vector3()).length();
  const tanV = Math.tan((fov * Math.PI) / 360);
  const tanH = tanV * cam.aspect;

  for (let i = 0; i < 6; i++) {
    cam.position.copy(target).addScaledVector(dir, distance);
    cam.lookAt(target);
    cam.updateMatrixWorld(true);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const c of pts) {
      p.copy(c).project(cam);
      x0 = Math.min(x0, p.x);
      x1 = Math.max(x1, p.x);
      y0 = Math.min(y0, p.y);
      y1 = Math.max(y1, p.y);
    }
    const scale = Math.max((x1 - x0) / (ax1 - ax0), (y1 - y0) / (ay1 - ay0));
    // shift the target so the projected box sits in the middle of the allowed window
    right.setFromMatrixColumn(cam.matrixWorld, 0);
    up.setFromMatrixColumn(cam.matrixWorld, 1);
    target.addScaledVector(right, ((x0 + x1) / 2 - (ax0 + ax1) / 2) * distance * tanH);
    target.addScaledVector(up, ((y0 + y1) / 2 - (ay0 + ay1) / 2) * distance * tanV);
    distance *= scale;
  }
  const position = target.clone().addScaledVector(dir, distance);
  return { position: [position.x, position.y, position.z], target: [target.x, target.y, target.z] };
}
