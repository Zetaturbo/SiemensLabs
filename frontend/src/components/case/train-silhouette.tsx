import trainParts from "@/config/train-parts.json";

type Vec3 = [number, number, number];
interface Box {
  min: Vec3;
  max: Vec3;
  repeat?: { count: number; step: Vec3 };
}
interface PartGeo {
  id: string;
  label: string;
  position: Vec3;
  glb?: { outline?: Box[]; carve?: Box[] };
}

const PARTS = (trainParts as unknown as { parts: PartGeo[] }).parts;

/**
 * Side view of the car in the train map's frame (metres; nose at +x, rail top at y = 0), so the
 * hotspot data in train-parts.json places the highlight. Boxes from glb.outline / glb.carve are
 * projected onto the x/y plane; parts without boxes get a ring at their anchor.
 */
function highlightRects(part: PartGeo): Array<{ x: number; y: number; w: number; h: number }> {
  const boxes = [...(part.glb?.outline ?? []), ...(part.glb?.carve ?? [])];
  const out = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (const b of boxes) {
    const n = b.repeat?.count ?? 1;
    for (let i = 0; i < n; i++) {
      const dx = (b.repeat?.step[0] ?? 0) * i;
      const dy = (b.repeat?.step[1] ?? 0) * i;
      const r = { x: b.min[0] + dx, y: b.min[1] + dy, w: Math.max(b.max[0] - b.min[0], 0.12), h: Math.max(b.max[1] - b.min[1], 0.12) };
      out.set(`${r.x.toFixed(2)}:${r.y.toFixed(2)}:${r.w.toFixed(2)}:${r.h.toFixed(2)}`, r);
    }
  }
  return [...out.values()];
}

const WINDOWS = Array.from({ length: 15 }, (_, i) => -10.2 + i * 1.05).filter((x) => x < 4.8 || x > 6.2);
const WHEELS = [-9.75, -6.75, 4.55, 7.55];
const BOGIES = [-8.25, 6.05];

export function TrainSilhouette({ partId, className }: { partId: string; className?: string }) {
  const part = PARTS.find((p) => p.id === partId);
  const rects = part ? highlightRects(part) : [];
  const line = { vectorEffect: "non-scaling-stroke" as const, strokeWidth: 1 };
  return (
    <svg viewBox="-12 -6 23.5 6.6" className={className} role="img" aria-label={part ? `Train side view, ${part.label} highlighted` : "Train side view"}>
      <g transform="scale(1,-1)">
        {/* rail */}
        <line x1={-12} x2={11.5} y1={0} y2={0} className="stroke-line" {...line} />
        {/* pantograph */}
        <path d="M -9.5 4.02 L -8.7 4.85 L -8.0 4.02 M -9.3 5.05 L -8.1 5.05 M -8.7 4.85 L -8.7 5.05" className="fill-none stroke-strong" {...line} />
        {/* roof unit */}
        <rect x={-6.7} y={3.98} width={1.8} height={0.38} rx={0.08} className="fill-sunken stroke-line" {...line} />
        {/* body with a sloped nose */}
        <path
          d="M -11.4 0.95 L 8.9 0.95 Q 10.7 1.0 10.75 1.7 Q 10.6 2.6 9.5 3.4 Q 8.6 4.0 7.6 4.0 L -11.4 4.0 Z"
          className="fill-surface stroke-strong"
          {...line}
        />
        {/* windows, windscreen, door */}
        {WINDOWS.map((x) => (
          <rect key={x} x={x} y={2.45} width={0.7} height={0.6} rx={0.08} className="fill-sunken" />
        ))}
        <path d="M 8.3 2.5 L 9.55 2.5 Q 9.9 2.9 9.4 3.35 L 8.3 3.35 Z" className="fill-sunken" />
        <rect x={5.15} y={1.3} width={0.65} height={1.8} rx={0.06} className="fill-none stroke-line" {...line} />
        {/* bogies */}
        {BOGIES.map((c) => (
          <rect key={c} x={c - 1.95} y={0.55} width={3.9} height={0.3} rx={0.1} className="fill-sunken stroke-line" {...line} />
        ))}
        {WHEELS.map((x) => (
          <circle key={x} cx={x} cy={0.42} r={0.42} className="fill-surface stroke-strong" {...line} />
        ))}
        {/* highlighted part */}
        {part && (
          <g className="text-ink">
            {rects.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={0.06} fill="currentColor" fillOpacity={0.85} />
            ))}
            {rects.length === 0 && <circle cx={part.position[0]} cy={part.position[1]} r={0.5} fill="currentColor" fillOpacity={0.18} stroke="currentColor" {...line} />}
            <circle cx={part.position[0]} cy={part.position[1]} r={0.16} fill="currentColor" />
          </g>
        )}
      </g>
    </svg>
  );
}
