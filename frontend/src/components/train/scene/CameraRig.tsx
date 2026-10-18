"use client";
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import { useThree, type RootState } from "@react-three/fiber";
import { useEffect, useRef, type RefObject } from "react";
import { Box3, MathUtils, Spherical, Vector3, type PerspectiveCamera } from "three";
import { panelInset } from "../layout";
import { useReducedMotion, useTrainUi } from "../store";
import { fitPose, type Pose } from "./frame";

/** Overview per model: the GLB is one end car, the placeholder adds an intermediate car behind it. */
export const OVERVIEW: Record<"glb" | "placeholder", Pose> = {
  glb: { position: [17.5, 12.2, 27.5], target: [0.9, 1.5, 0] },
  placeholder: { position: [11, 17.5, 38], target: [-6.2, 1.3, 0] },
};

const overviewDirection = (status: string): Pose => (status === "placeholder" || status === "error" ? OVERVIEW.placeholder : OVERVIEW.glb);

/** The overview: the whole train fitted into the canvas from the model's overview direction. */
function overview(camera: PerspectiveCamera, width: number, height: number): Pose {
  const { modelStatus, bounds } = useTrainUi.getState();
  const from = overviewDirection(modelStatus);
  return bounds && width > 0 && height > 0 ? fitPose(bounds, from, camera.fov, width, height) : from;
}

/** Pan limit for the orbit target before the model reports its bounds (camera-controls boundary). */
const BOUNDARY = new Box3(new Vector3(-40, -0.5, -14), new Vector3(20, 8, 14));
/** Margin around the model bounds that the orbit target may be panned into, so the train cannot be lost. */
const BOUNDARY_MARGIN = new Vector3(4, 1, 4);

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
/** Zoom buttons and +/- keys: one capped wheel notch (camera-controls divides pixel deltas by 30 off macOS). */
const ZOOM_STEP = Math.pow(0.95, (MAX_WHEEL_PX / 30) * DOLLY_SPEED);

const { ACTION } = CameraControlsImpl;

/** A trackpad gesture is a stream of wheel events; events this close together belong to the same one. */
const GESTURE_GAP_MS = 220;

/**
 * Tells a classic mouse wheel from a two-finger trackpad scroll (browsers report both as wheel events):
 * line-mode deltas are a wheel; a sideways component or a fractional or small delta is a trackpad; a large
 * whole-number vertical delta (one notch, about 100 or 120 px) is a wheel, unless it continues a trackpad
 * stream (a fast flick can produce large deltas too).
 */
function isMouseWheel(e: WheelEvent, inTrackpadGesture: boolean): boolean {
  if (e.deltaMode !== 0) return true;
  if (e.deltaX !== 0 || !Number.isInteger(e.deltaY) || Math.abs(e.deltaY) < 50) return false;
  return !inTrackpadGesture;
}

/**
 * Wheel input, in the capture phase on the element camera-controls listens on:
 * - pinch (wheel with ctrlKey, macOS) and a classic mouse wheel dolly to the cursor; camera-controls would
 *   turn a pinch into camera zoom (FOV), which ignores the distance limits and survives Reset, so pinches
 *   are re-dispatched as plain wheel events, and oversized deltas are capped;
 * - a two-finger trackpad scroll pans (trucks) the view with the fingers, damped, within the boundary.
 */
function useWheelGestures(el: HTMLElement, controls: RefObject<CameraControls | null>, get: () => RootState) {
  useEffect(() => {
    let lastTrackpadAt = -Infinity;
    const onWheel = (e: WheelEvent) => {
      if (!e.isTrusted) return; // our own re-dispatch
      const c = controls.current;
      if (!c) return;
      if (!e.ctrlKey && !isMouseWheel(e, e.timeStamp - lastTrackpadAt < GESTURE_GAP_MS)) {
        lastTrackpadAt = e.timeStamp;
        e.preventDefault();
        e.stopImmediatePropagation();
        const { camera, size } = get();
        // world units per screen pixel at the orbit target, so the train follows the fingers
        const perPx = (2 * c.distance * Math.tan(MathUtils.degToRad((camera as PerspectiveCamera).fov) / 2)) / Math.max(1, size.height);
        const dx = MathUtils.clamp(e.deltaX, -MAX_WHEEL_PX, MAX_WHEEL_PX);
        const dy = MathUtils.clamp(e.deltaY, -MAX_WHEEL_PX, MAX_WHEEL_PX);
        void c.truck(dx * perPx, dy * perPx, true);
        useTrainUi.getState().markInteracted();
        return;
      }
      const deltaY = e.deltaMode === 0 ? MathUtils.clamp(e.deltaY, -MAX_WHEEL_PX, MAX_WHEEL_PX) : e.deltaY;
      if (!e.ctrlKey && deltaY === e.deltaY) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      const init: WheelEventInit = {
        bubbles: true,
        cancelable: true,
        deltaX: 0,
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
  }, [el, controls, get]);
}

/** Shift + left drag pans for mouse users (middle and right drag pan through the button mapping). */
function useShiftPan(el: HTMLElement, controls: RefObject<CameraControls | null>) {
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const c = controls.current;
      if (c) c.mouseButtons.left = e.shiftKey ? ACTION.TRUCK : ACTION.ROTATE;
    };
    el.addEventListener("pointerdown", onDown, { capture: true });
    return () => el.removeEventListener("pointerdown", onDown, { capture: true });
  }, [el, controls]);
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
  const bounds = useTrainUi((s) => s.bounds);
  const reduced = useReducedMotion();
  const get = useThree((s) => s.get);
  // same element drei's CameraControls connects to
  const wheelTarget = useThree((s) => (s.events.connected as HTMLElement | undefined) ?? s.gl.domElement);
  useWheelGestures(wheelTarget, ref, get);
  useShiftPan(wheelTarget, ref);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.middle = ACTION.TRUCK;
    c.mouseButtons.right = ACTION.TRUCK;
    if (process.env.NODE_ENV !== "production") (window as unknown as { __trainControls?: CameraControls }).__trainControls = c;
  }, []);

  useEffect(() => {
    const box = bounds ? new Box3(new Vector3(...bounds.min), new Vector3(...bounds.max)).expandByVector(BOUNDARY_MARGIN) : BOUNDARY;
    ref.current?.setBoundary(box);
  }, [bounds]);

  useEffect(() => {
    if (status === "loading") return;
    const { camera, size } = get();
    const o = overview(camera as PerspectiveCamera, size.width, size.height);
    void ref.current?.setLookAt(...o.position, ...o.target, false);
  }, [status, bounds, get]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !request) return;
    const animate = !reduced;
    if (request.kind === "zoom") {
      const d = MathUtils.clamp(c.distance * (request.dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP), c.minDistance, c.maxDistance);
      void c.dollyTo(d, animate);
      return;
    }
    const { camera, size } = get();
    const cam = camera as PerspectiveCamera;
    if (request.kind === "reset") {
      const o = overview(cam, size.width, size.height);
      void c.setLookAt(...o.position, ...o.target, animate);
      void c.setFocalOffset(0, 0, 0, animate);
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
    // centre the part in the area the part panel leaves free
    const inset = panelInset(size.width);
    const visibleWidth = 2 * s.radius * Math.tan(MathUtils.degToRad(cam.fov) / 2) * cam.aspect;
    void c.setFocalOffset((inset / 2 / size.width) * visibleWidth, 0, 0, animate);
  }, [request, reduced, get]);

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
