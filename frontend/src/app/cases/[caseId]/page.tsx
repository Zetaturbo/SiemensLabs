import { CaseScreen } from "@/components/case/case-screen";

// Dynamic params make this route render at request time (Next 16 prerender rule).
export const instant = false;

/** One sourcing case, run through the chat: context rail, filter chips, conversation. */
export default function CasePage() {
  return <CaseScreen />;
}
