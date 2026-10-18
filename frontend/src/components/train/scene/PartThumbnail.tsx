"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { cn, Skeleton } from "@/design-system/react";
import "../blueprint.css";
import { PART_BY_ID } from "../config";
import type { Spin } from "./PartThumbnailCanvas";

const ThumbnailCanvas = dynamic(() => import("./PartThumbnailCanvas"), { ssr: false });

export interface PartThumbnailProps {
  partId: string;
  /** CSS pixels; default 240 x 160. */
  size?: { width: number; height: number };
  /** Drag to turn the part; the auto-rotation pauses while dragging. */
  interactive?: boolean;
  className?: string;
}

const DEFAULT_SIZE = { width: 240, height: 160 };
const RESUME_MS = 1500;

/**
 * A small blueprint 3D view of one train part, for screens outside the train map (the case rail).
 * Self-contained: its own canvas, palette and loading state; it never touches the train map's store or camera.
 * The part turns once per 24 s while on screen (not under prefers-reduced-motion) and costs nothing when idle.
 */
export function PartThumbnail(props: PartThumbnailProps) {
  return <Thumbnail key={props.partId} {...props} />;
}

function Thumbnail({ partId, size = DEFAULT_SIZE, interactive = false, className }: PartThumbnailProps) {
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const spin = useRef<Spin>({ yaw: -0.5, pitch: 0, pausedUntil: 0, dragging: false, visible: true });
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      spin.current.visible = e.isIntersecting;
      if (e.isIntersecting) spin.current.invalidate?.();
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const label = PART_BY_ID[partId]?.label ?? partId;
  return (
    <div
      ref={box}
      role="img"
      aria-label={`3D view of ${label}`}
      className={cn("relative isolate overflow-hidden rounded-lg", interactive && "cursor-grab touch-none active:cursor-grabbing", className)}
      style={{ width: size.width, height: size.height, background: "var(--bp-bg)" }}
      onPointerDown={
        interactive
          ? (e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              drag.current = { x: e.clientX, y: e.clientY };
              spin.current.dragging = true;
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (e) => {
              const d = drag.current;
              if (!d) return;
              const s = spin.current;
              s.yaw += (e.clientX - d.x) * 0.012;
              s.pitch = Math.max(-0.5, Math.min(0.5, s.pitch + (e.clientY - d.y) * 0.008));
              drag.current = { x: e.clientX, y: e.clientY };
              s.invalidate?.();
            }
          : undefined
      }
      onPointerUp={
        interactive
          ? () => {
              drag.current = null;
              spin.current.dragging = false;
              spin.current.pausedUntil = performance.now() + RESUME_MS;
              setTimeout(() => spin.current.invalidate?.(), RESUME_MS + 20);
            }
          : undefined
      }
    >
      <ThumbnailCanvas partId={partId} width={size.width} height={size.height} spin={spin} onReady={onReady} />
      {!ready && <Skeleton className="absolute inset-0 h-full rounded-none" />}
    </div>
  );
}
