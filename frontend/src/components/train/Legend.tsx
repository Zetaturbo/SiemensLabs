import { Card } from "@/design-system/react";
import { STAGE_LABEL, STAGES } from "./encoding";
import { FLAG_CSS, GHOST_CSS, STAGE_CSS } from "./palette";

/** Colour key for the canvas: stage ramp, red flags, pulse, selection, filter ghosting. */
export function Legend() {
  return (
    <Card variant="elevated" padding="none" className="pointer-events-none bg-surface/90 px-3 py-2 backdrop-blur-xl">
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink">
        {STAGES.map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full ring-1 ring-subtle" style={{ background: STAGE_CSS[s] }} />
            {STAGE_LABEL[s]}
          </li>
        ))}
      </ul>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtext">
        <li className="flex items-center gap-1.5">
          <span className="tabular grid h-3.5 min-w-3.5 place-items-center rounded-full px-0.5 font-mono text-[9px] font-bold text-inverse" style={{ background: FLAG_CSS }}>
            2
          </span>
          Red flags
        </li>
        <li className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-full" style={{ boxShadow: `0 0 0 1px var(--lw-surface), 0 0 0 2.5px ${STAGE_CSS.none}` }} />
          Pulsing: safety part, no case
        </li>
        <li className="flex items-center gap-1.5">
          <span className="w-4 border-t-2 border-dashed border-strong" />
          Selected
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-[3px] w-4 rounded-full" style={{ background: GHOST_CSS }} />
          Filtered out
        </li>
      </ul>
    </Card>
  );
}
