import { MemoView } from "@/components/case/memo-view";

// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

/** Award recommendation memo built from case state; markdown export. */
export default function CaseMemoPage() {
  return <MemoView />;
}
