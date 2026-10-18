"use client";
import { useCallback } from "react";
import { STAGE_LABEL, type PartView } from "./encoding";
import { registerNode } from "./label-registry";
import { FLAG_CSS, GHOST_CSS, STAGE_CSS } from "./palette";
import { usePartViews, useTrainUi } from "./store";

const flags = (n: number) => `${n} red flag${n === 1 ? "" : "s"}`;

function Callout({ view }: { view: PartView }) {
  const id = view.part.id;
  const select = useTrainUi((s) => s.select);
  const hover = useTrainUi((s) => s.hover);
  const hovered = useTrainUi((s) => s.hoveredId === id);
  const selected = useTrainUi((s) => s.selectedId === id);
  const markerRef = useCallback((el: HTMLButtonElement | null) => registerNode(id, "marker", el), [id]);
  const labelRef = useCallback((el: HTMLButtonElement | null) => registerNode(id, "label", el), [id]);
  const lineRef = useCallback((el: SVGLineElement | null) => registerNode(id, "line", el), [id]);

  const color = view.matches ? STAGE_CSS[view.stage] : GHOST_CSS;
  const hot = hovered || selected;
  const dim = !view.matches;
  const tint = (pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;
  const handlers = {
    onClick: () => select(id, { fly: true }),
    onPointerEnter: () => hover(id),
    onPointerLeave: () => {
      if (useTrainUi.getState().hoveredId === id) hover(null);
    },
  };
  const owner = view.owner ? `${view.owner.name} (${view.owner.department})` : view.case ? "unassigned" : null;

  return (
    <>
      <svg className="pointer-events-none absolute inset-0 size-full overflow-visible">
        <line ref={lineRef} className="invisible" stroke={color} strokeOpacity={dim ? 0.25 : hot ? 0.95 : 0.6} strokeWidth={hot ? 1.5 : 1} />
      </svg>
      <button
        ref={labelRef}
        type="button"
        data-part={id}
        data-near="0"
        className={`group/label absolute top-0 left-0 block w-max max-w-44 rounded-md border px-2 py-1 text-left font-mono text-[10.5px] leading-tight whitespace-normal invisible backdrop-blur-[2px]`}
        style={{
          borderColor: hot ? color : tint(40),
          color: "var(--bp-text)",
          background: `color-mix(in srgb, var(--bp-bg) ${hot ? 96 : 80}%, transparent)`,
          zIndex: hot ? 3 : 1,
        }}
        {...handlers}
      >
        <span className={`block ${dim ? "opacity-40" : ""}`}>
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: color }} />
            <span className="font-semibold tracking-wide">{view.part.label}</span>
          </span>
          <span className={`mt-0.5 text-[10px] opacity-75 ${hot ? "block" : "hidden group-data-[near=1]/label:block"}`}>
            {STAGE_LABEL[view.stage]}
            {owner && ` · ${owner}`}
            {view.flagCount > 0 && <span style={{ color: FLAG_CSS }}>{` · ${flags(view.flagCount)}`}</span>}
          </span>
        </span>
      </button>
      <button
        ref={markerRef}
        type="button"
        aria-label={`${view.part.label}: ${STAGE_LABEL[view.stage]}`}
        className="absolute top-0 left-0 -mt-2.5 -ml-2.5 grid size-5 place-items-center rounded-full invisible"
        style={{ zIndex: 4 }}
        {...handlers}
      >
        {view.needsCase && view.matches && <span className="train-pulse absolute inset-0 rounded-full" style={{ boxShadow: `0 0 0 2px ${color}` }} />}
        <span
          className={`block size-2.5 rounded-full ${dim ? "opacity-40" : ""}`}
          style={{
            background: color,
            boxShadow: hot ? `0 0 0 2px var(--bp-bg), 0 0 0 4px ${tint(55)}, 0 0 12px ${color}` : `0 0 0 2px var(--bp-bg), 0 0 8px ${tint(60)}`,
          }}
        />
        {view.flagCount > 0 && (
          <span
            className={`tabular absolute -top-2 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[10px] leading-none font-bold ${dim ? "opacity-40" : ""}`}
            style={{ background: FLAG_CSS, color: "var(--bp-text)" }}
          >
            {view.flagCount}
          </span>
        )}
      </button>
    </>
  );
}

/** DOM overlay for hotspot markers, leader lines and labels; positioned by the canvas each frame. */
export function HotspotLayer() {
  const views = usePartViews();
  return (
    <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden [&_button]:pointer-events-auto">
      {views.map((v) => (
        <Callout key={v.part.id} view={v} />
      ))}
    </div>
  );
}
