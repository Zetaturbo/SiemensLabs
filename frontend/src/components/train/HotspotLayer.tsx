"use client";
import { useCallback } from "react";
import { X } from "lucide-react";
import { stageText, type PartView } from "./encoding";
import { registerHoverLabel, registerMarker, registerSelectionLabel, registerSelectionLine } from "./label-registry";
import { FLAG_CSS, GHOST_CSS, STAGE_CSS } from "./palette";
import { usePartViewMap, usePartViews, useTrainUi } from "./store";

const flags = (n: number) => `${n} red flag${n === 1 ? "" : "s"}`;

/** One small stage-coloured dot per part, a flag pip where the case has red flags. No text in the scene. */
function Marker({ view }: { view: PartView }) {
  const id = view.part.id;
  const select = useTrainUi((s) => s.select);
  const hover = useTrainUi((s) => s.hover);
  const hovered = useTrainUi((s) => s.hoveredId === id);
  const selected = useTrainUi((s) => s.selectedId === id);
  const discovered = useTrainUi((s) => s.discovered);
  const ref = useCallback((el: HTMLButtonElement | null) => registerMarker(id, el), [id]);

  const color = view.matches ? STAGE_CSS[view.stage] : GHOST_CSS;
  const dim = !view.matches;
  const scale = selected ? 1.5 : hovered ? 1.3 : 1;

  return (
    <button
      ref={ref}
      type="button"
      data-part={id}
      aria-label={`${view.part.label}: ${stageText(view)}${view.flagCount ? `, ${flags(view.flagCount)}` : ""}`}
      aria-pressed={selected}
      className="absolute top-0 left-0 -mt-4 -ml-4 grid size-8 cursor-pointer place-items-center rounded-full invisible focus-visible:outline-1 focus-visible:-outline-offset-4"
      style={{ zIndex: selected ? 3 : hovered ? 2 : 1, outlineColor: "var(--bp-text)" }}
      onClick={() => select(id, { fly: true })}
      onPointerEnter={() => hover(id)}
      onPointerLeave={() => {
        if (useTrainUi.getState().hoveredId === id) hover(null);
      }}
    >
      {/* discovery ring on every dot until the first selection this session; safety parts without a case keep theirs */}
      {view.matches && (!discovered || view.needsCase) && (
        <span className="train-pulse absolute inset-2.5 rounded-full" style={{ boxShadow: `0 0 0 1px ${color}` }} />
      )}
      <span
        className={`relative block size-2 rounded-full transition-transform duration-200 ease-[var(--lw-ease-out)] motion-reduce:transition-none ${dim ? "opacity-40" : ""}`}
        style={{
          background: color,
          transform: `scale(${scale})`,
          // a crisp disc with a one-pixel ring in the sheet colour, so it separates from the lines behind it;
          // the glow is for hover and selection only, and only where the theme asks for it (--bp-dot-glow)
          boxShadow: `0 0 0 1px var(--bp-bg)${hovered || selected ? `, 0 0 10px 1px color-mix(in srgb, ${color} var(--bp-dot-glow), transparent)` : ""}`,
        }}
      >
        {view.flagCount > 0 && (
          <span
            aria-hidden
            className="absolute -top-[3px] -right-[3px] block size-1.5 rounded-full"
            style={{ background: FLAG_CSS, boxShadow: "0 0 0 1px var(--bp-bg)", transform: `scale(${1 / scale})` }}
          />
        )}
      </span>
    </button>
  );
}

/** The one label in the scene: part name with a leader line to its dot, shown only while a part is selected. */
function SelectionLabel() {
  const selectedId = useTrainUi((s) => s.selectedId);
  const views = usePartViewMap();
  const view = selectedId ? views[selectedId] : undefined;
  const select = useTrainUi((s) => s.select);
  const labelRef = useCallback((el: HTMLDivElement | null) => registerSelectionLabel(el), []);
  const lineRef = useCallback((el: SVGLineElement | null) => registerSelectionLine(el), []);
  if (!view) return null;
  const color = view.matches ? STAGE_CSS[view.stage] : GHOST_CSS;

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible" aria-hidden>
        <line ref={lineRef} className="invisible" stroke={color} strokeOpacity={0.9} strokeWidth={1} shapeRendering="geometricPrecision" />
      </svg>
      <div
        key={view.part.id}
        ref={labelRef}
        role="status"
        data-testid="train-selection-label"
        className="train-label-in pointer-events-none absolute top-0 left-0 flex w-max max-w-60 items-center gap-1.5 rounded-md border py-1 pr-1 pl-2 text-xs font-medium shadow-sm invisible"
        style={{
          borderColor: `color-mix(in srgb, ${color} 60%, transparent)`,
          color: "var(--bp-text)",
          background: "color-mix(in srgb, var(--bp-bg) 90%, transparent)",
          backdropFilter: "blur(var(--lw-glass-blur))",
        }}
      >
        <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: color }} />
        {view.part.label}
        <button
          type="button"
          aria-label={`Deselect ${view.part.label}`}
          className="-my-0.5 ml-0.5 grid size-5 shrink-0 cursor-pointer place-items-center rounded opacity-55 transition-opacity hover:opacity-100 [&_svg]:size-3"
          onClick={() => select(null)}
        >
          <X />
        </button>
      </div>
    </>
  );
}

/** Name and stage next to the hovered dot or part; the click label stays the part name. */
function HoverLabel() {
  const hoveredId = useTrainUi((s) => s.hoveredId);
  const selectedId = useTrainUi((s) => s.selectedId);
  const views = usePartViewMap();
  const view = hoveredId && hoveredId !== selectedId ? views[hoveredId] : undefined;
  const ref = useCallback((el: HTMLDivElement | null) => registerHoverLabel(el), []);
  if (!view) return null;
  return (
    <div
      key={view.part.id}
      ref={ref}
      aria-hidden
      className="train-label-in pointer-events-none absolute top-0 left-0 flex w-max items-center gap-1.5 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm invisible"
      style={{ color: "var(--bp-text)", background: "color-mix(in srgb, var(--bp-bg) 90%, transparent)" }}
    >
      <span className="font-medium">{view.part.label}</span>
      <span style={{ color: "color-mix(in srgb, var(--bp-text) 62%, transparent)" }}>{stageText(view)}</span>
    </div>
  );
}

/** DOM overlay for hotspot dots and the selection label; positioned by the canvas each frame. */
export function HotspotLayer() {
  const views = usePartViews();
  return (
    <div className="train-dots-in pointer-events-none absolute inset-0 z-10 overflow-hidden [&_button]:pointer-events-auto">
      <SelectionLabel />
      <HoverLabel />
      {views.map((v) => (
        <Marker key={v.part.id} view={v} />
      ))}
    </div>
  );
}
