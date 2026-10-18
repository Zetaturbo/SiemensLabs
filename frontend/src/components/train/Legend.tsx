import { STAGE_LABEL, STAGES } from "./encoding";
import { FLAG_CSS, STAGE_CSS } from "./palette";

function Swatch({ color }: { color: string }) {
  return <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color, boxShadow: "0 0 0 1px var(--bp-bg)" }} />;
}

/** Colour key for the dots on one line, in the same glass chip as the filters: the stage ramp and red flags. */
export function Legend() {
  return (
    <ul
      aria-label="Legend"
      className="pointer-events-none flex h-8 items-center gap-3 rounded-lg border border-line bg-[var(--lw-glass-strong)] px-3 text-2xs whitespace-nowrap text-subtext shadow-sm backdrop-blur-[var(--lw-glass-blur)]"
    >
      {STAGES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <Swatch color={STAGE_CSS[s]} />
          {STAGE_LABEL[s]}
        </li>
      ))}
      <li className="flex items-center gap-1.5 border-l border-line pl-3">
        <Swatch color={FLAG_CSS} />
        Red flags
      </li>
    </ul>
  );
}
