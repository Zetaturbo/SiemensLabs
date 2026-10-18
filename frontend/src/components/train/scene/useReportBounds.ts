"use client";
import { useEffect, useRef } from "react";
import { Box3, type Group } from "three";
import { useTrainUi } from "../store";

/** Measures the model group once it is mounted and stores its bounds for the overview fit. */
export function useReportBounds() {
  const ref = useRef<Group>(null);
  const setBounds = useTrainUi((s) => s.setBounds);
  useEffect(() => {
    if (!ref.current) return;
    const b = new Box3().setFromObject(ref.current);
    if (b.isEmpty()) return;
    setBounds({ min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] });
    return () => setBounds(null);
  }, [setBounds]);
  return ref;
}
