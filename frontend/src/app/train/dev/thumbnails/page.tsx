import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PartThumbnail } from "@/components/train";

export const metadata: Metadata = { title: "Part thumbnails · dev" };

const PARTS = [
  { id: "brake_system", note: "procedural geometry, cropped to one bogie" },
  { id: "pantograph", note: "GLB geometry" },
  { id: "bogie_wheelsets", note: "GLB geometry, cropped, interactive" },
];

/** Development check for PartThumbnail: three parts side by side (toggle the theme in the top bar). */
export default function ThumbnailsDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div className="p-6">
      <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">Part thumbnails</h1>
      <p className="mt-1 text-sm text-subtext">240 x 160, auto-rotating; the third one can be dragged.</p>
      <div className="mt-6 flex flex-wrap gap-6">
        {PARTS.map((p, i) => (
          <figure key={p.id} className="space-y-2">
            <PartThumbnail partId={p.id} interactive={i === 2} className="border border-line" />
            <figcaption className="text-xs text-subtext">
              <span className="font-mono text-ink">{p.id}</span> · {p.note}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
