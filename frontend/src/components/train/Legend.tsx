import { STAGE_LABEL, STAGES } from "./encoding";
import { FLAG_CSS, STAGE_CSS } from "./palette";

/** Colour key for the dots, one thin line: stage ramp and the red-flag pip. */
export function Legend() {
  return (
    <ul aria-label="Legend" className="pointer-events-none flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-2xs" style={{ color: "color-mix(in srgb, var(--bp-text) 72%, transparent)" }}>
      {STAGES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="size-1.5 rounded-full" style={{ background: STAGE_CSS[s] }} />
          {STAGE_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5">
        <span className="size-1.5 rounded-full" style={{ background: FLAG_CSS }} />
        Red flags
      </li>
    </ul>
  );
}
