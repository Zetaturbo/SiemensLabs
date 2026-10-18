"use client";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { IconButton, Tooltip } from "@/design-system/react";
import { useTrainUi } from "./store";

function Shortcut({ label, keys }: { label: string; keys: string }) {
  return (
    <span className="flex items-center gap-2">
      {label}
      <span className="font-mono opacity-60">{keys}</span>
    </span>
  );
}

/** Reset back to the overview and drop the selection: the Reset button, R and Esc all do this. */
export function resetMap() {
  const ui = useTrainUi.getState();
  ui.select(null);
  ui.resetView();
  ui.markInteracted();
}

/** Zoom in, zoom out and reset, bottom-left on the canvas. */
export function MapControls() {
  const zoom = useTrainUi((s) => s.zoom);
  return (
    <div role="group" aria-label="View controls" className="pointer-events-auto flex flex-col gap-1">
      <Tooltip label={<Shortcut label="Zoom in" keys="+" />} side="right">
        <IconButton aria-label="Zoom in" aria-keyshortcuts="+" variant="secondary" size="md" onClick={() => zoom(1)}>
          <Plus />
        </IconButton>
      </Tooltip>
      <Tooltip label={<Shortcut label="Zoom out" keys="−" />} side="right">
        <IconButton aria-label="Zoom out" aria-keyshortcuts="-" variant="secondary" size="md" onClick={() => zoom(-1)}>
          <Minus />
        </IconButton>
      </Tooltip>
      <Tooltip label={<Shortcut label="Reset view" keys="R" />} side="right">
        <IconButton aria-label="Reset view" aria-keyshortcuts="R" variant="secondary" size="md" className="mt-1" onClick={resetMap}>
          <RotateCcw />
        </IconButton>
      </Tooltip>
    </div>
  );
}
