import { FinalistsView } from "@/components/case/finalists-view";

// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

/** Finalists: one column per finalist, linked entity, research status, award. */
export default function CaseFinalistsPage() {
  return <FinalistsView />;
}
