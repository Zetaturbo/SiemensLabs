import { ExplorerView } from "@/components/explorer/explorer-view";

// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

/** Long list: hard requirements, results, Kraljic matrix. */
export default function CaseExplorerPage() {
  return <ExplorerView />;
}
