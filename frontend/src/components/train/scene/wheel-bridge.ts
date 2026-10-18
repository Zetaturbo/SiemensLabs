/**
 * Wheel, trackpad and pinch input that lands on the DOM overlay (a dot, a label) belongs to the scene too:
 * the overlay forwards it to the element the camera rig listens on, so zooming or panning over a dot
 * behaves exactly like over empty canvas.
 */
const forwarded = new WeakSet<Event>();
let target: HTMLElement | null = null;

export function setWheelTarget(el: HTMLElement | null) {
  target = el;
}

export const isForwardedWheel = (e: Event) => forwarded.has(e);

export function forwardWheel(e: WheelEvent) {
  if (!target) return;
  e.preventDefault();
  const copy = new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    deltaMode: e.deltaMode,
    clientX: e.clientX,
    clientY: e.clientY,
    screenX: e.screenX,
    screenY: e.screenY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
  });
  forwarded.add(copy);
  target.dispatchEvent(copy);
}
