"use client";
import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { useTrainUi } from "../store";

const setCursor = (el: HTMLElement, cursor: string) => {
  el.style.cursor = cursor;
};

/** Canvas cursor: grab over empty space, grabbing while dragging, pointer over a part. */
export function CanvasCursor() {
  const el = useThree((s) => s.gl.domElement);
  useEffect(() => {
    let down = false;
    const apply = () => {
      setCursor(el, down ? "grabbing" : useTrainUi.getState().hoveredId ? "pointer" : "grab");
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      down = true;
      apply();
    };
    const onUp = () => {
      if (!down) return;
      down = false;
      apply();
    };
    apply();
    const unsub = useTrainUi.subscribe((s, prev) => {
      if (s.hoveredId !== prev.hoveredId) apply();
    });
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      unsub();
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setCursor(el, "");
    };
  }, [el]);
  return null;
}
