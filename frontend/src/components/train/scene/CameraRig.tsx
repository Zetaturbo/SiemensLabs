"use client";
import { CameraControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
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

/**
 * Wheel and trackpad zoom. camera-controls scales each wheel event by 0.95^(delta * dollySpeed); 3 is three
 * times its default, so a trackpad scroll or pinch covers the overview-to-part range in one gesture.
 * Damping (smoothTime) and the distance limits are unchanged; the damped dolly cannot overshoot them.
 */
const DOLLY_SPEED = 3;
/**
 * Cap for one pixel-mode wheel event. Trackpad events are mostly under this and keep the full 3x; a mouse
 * notch (about 100 px) or a momentum spike is capped so a single event cannot jump most of the range.
 */
const MAX_WHEEL_PX = 60;

/**
 * camera-controls turns a trackpad pinch (wheel with ctrlKey) into camera zoom (FOV), which ignores the
 * distance limits and survives Reset. Re-dispatch pinches as plain wheel events so they dolly like a
 * scroll, and cap oversized events. Runs in the capture phase on the element camera-controls listens on.
 */
function useWheelNormalizer(el: HTMLElement) {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      if (!e.isTrusted) return; // our own re-dispatch
      const deltaY = e.deltaMode === 0 ? MathUtils.clamp(e.deltaY, -MAX_WHEEL_PX, MAX_WHEEL_PX) : e.deltaY;
      if (!e.ctrlKey && deltaY === e.deltaY) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const init: WheelEventInit = {
        bubbles: true,
        cancelable: true,
        deltaX: e.deltaX,
        deltaY,
        deltaMode: e.deltaMode,
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
      };
      (e.target ?? el).dispatchEvent(new WheelEvent("wheel", init));
    };
    el.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => el.removeEventListener("wheel", onWheel, { capture: true });
  }, [el]);
}

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
  // same element drei's CameraControls connects to
  const wheelTarget = useThree((s) => (s.events.connected as HTMLElement | undefined) ?? s.gl.domElement);
  useWheelNormalizer(wheelTarget);

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
      dollySpeed={DOLLY_SPEED}
      dollyToCursor
    />
  );
}
