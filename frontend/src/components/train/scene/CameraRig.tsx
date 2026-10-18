"use client";
import { CameraControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { Box3, MathUtils, Spherical, Vector3 } from "three";
import type { Vec3 } from "../config";
import { useReducedMotion, useTrainUi } from "../store";

type Pose = { position: Vec3; target: Vec3 };

/** Overview per model: the GLB is one end car, the placeholder adds an intermediate car behind it. */
export const OVERVIEW: Record<"glb" | "placeholder", Pose> = {
  glb: { position: [17.5, 12.2, 27.5], target: [0.9, 1.5, 0] },
  placeholder: { position: [11, 17.5, 38], target: [-6.2, 1.3, 0] },
};

const overviewFor = (status: string): Pose => (status === "placeholder" || status === "error" ? OVERVIEW.placeholder : OVERVIEW.glb);

/** Pan limit for the orbit target (camera-controls boundary). */
const BOUNDARY = new Box3(new Vector3(-40, -0.5, -14), new Vector3(20, 8, 14));

/** Viewing distance per part when flying to it. */
const FOCUS_DISTANCE: Record<string, number> = { car_body: 15, pantograph: 9, interiors: 9 };

/**
 * Orbit navigation (damped rotate, dolly, pan with distance, polar and boundary limits) plus
 * camera flights. camera-controls does both, so it replaces OrbitControls to avoid two controllers
 * fighting over the camera.
 */
export function CameraRig() {
  const ref = useRef<CameraControls>(null);
  const request = useTrainUi((s) => s.camera);
  const status = useTrainUi((s) => s.modelStatus);
  const reduced = useReducedMotion();

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.setBoundary(BOUNDARY);
    if (process.env.NODE_ENV !== "production") (window as unknown as { __trainControls?: CameraControls }).__trainControls = c;
  }, []);

  useEffect(() => {
    if (status === "loading") return;
    const o = overviewFor(status);
    void ref.current?.setLookAt(...o.position, ...o.target, false);
  }, [status]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !request) return;
    const animate = !reduced;
    if (request.kind === "reset") {
      const o = overviewFor(useTrainUi.getState().modelStatus);
      void c.setLookAt(...o.position, ...o.target, animate);
      return;
    }
    const anchor = useTrainUi.getState().anchors[request.partId];
    if (!anchor) return;
    const target = new Vector3(...anchor);
    const dir = c.getPosition(new Vector3()).sub(c.getTarget(new Vector3()));
    const s = new Spherical().setFromVector3(dir);
    // look from the side the part sits on, at a polar angle that suits its height
    const low = anchor[1] < 1.3;
    const high = anchor[1] > 3.8;
    s.phi = high ? 0.95 : low ? 1.32 : 1.15;
    if (anchor[2] > 0.4 && Math.abs(s.theta) > 1.3) s.theta = Math.sign(s.theta) * 0.9;
    if (anchor[2] < -0.4 && Math.abs(s.theta) < 1.8) s.theta = Math.sign(s.theta || 1) * 2.3;
    s.theta = MathUtils.clamp(s.theta, -Math.PI, Math.PI);
    s.radius = FOCUS_DISTANCE[request.partId] ?? 7.5;
    const pos = new Vector3().setFromSpherical(s).add(target);
    void c.setLookAt(pos.x, pos.y, pos.z, target.x, target.y, target.z, animate);
  }, [request, reduced]);

  return (
    <CameraControls
      ref={ref}
      makeDefault
      minDistance={2.5}
      maxDistance={80}
      minPolarAngle={0.12}
      maxPolarAngle={Math.PI * 0.49}
      smoothTime={0.32}
      draggingSmoothTime={0.12}
      dollyToCursor
    />
  );
}
