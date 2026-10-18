import { ShortlistBoard } from "@/components/shortlist/shortlist-board";

// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

/** Shortlist: heatmap, family radar, weight sliders, advance or drop. */
export default function CaseShortlistPage() {
  return <ShortlistBoard />;
}
