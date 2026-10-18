"use client";
import { useSyncExternalStore } from "react";

let now = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(cb: () => void) {
  listeners.add(cb);
  if (!timer) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 30_000);
  }
  return () => {
    listeners.delete(cb);
    if (!listeners.size && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Current time on the client, refreshed every 30 s; null during SSR so relative times never mismatch. */
export function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (now ||= Date.now()),
    () => null,
  );
}
