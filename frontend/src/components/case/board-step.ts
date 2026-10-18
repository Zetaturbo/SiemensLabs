import { advanceToFinalists } from "@/lib/cases/actions";
import type { SourcingCase } from "@/lib/cases/types";

/** Suppliers a case needs on the shortlist before it can move on to finalists (and how many finalists it picks). */
export const MIN_PINNED = 3;

export type BoardStepKind = "pin" | "advance" | "award" | "memo";

export interface BoardStep {
  kind: BoardStepKind;
  label: string;
  disabled?: boolean;
}

/**
 * The board's one next step for the case's stage (the Continue button on /suppliers). Before three are pinned there
 * is nothing to do but pin; then the top of the shortlist advances to finalists; finalists are awarded (the award
 * dialog); an awarded case opens its decision memo in the case chat.
 */
export function boardStep(c: Pick<SourcingCase, "stage" | "shortlist" | "finalists">): BoardStep {
  if (c.stage === "awarded") return { kind: "memo", label: "Show the decision memo" };
  if (c.stage === "finalists" && c.finalists.length > 0) return { kind: "award", label: "Award a finalist" };
  if (c.shortlist.length < MIN_PINNED) return { kind: "pin", label: `Pin ${MIN_PINNED} candidates`, disabled: true };
  return { kind: "advance", label: "Advance to finalists" };
}

/** Advances the best-ranked pinned suppliers until the case has three finalists (or all pinned are finalists). */
export function advanceTop(c: Pick<SourcingCase, "id" | "shortlist" | "finalists">, ranked: string[], who: string) {
  const open = ranked.filter((id) => c.shortlist.includes(id) && !c.finalists.includes(id));
  const need = Math.max(1, MIN_PINNED - c.finalists.length);
  for (const id of open.slice(0, need)) advanceToFinalists(c.id, id, who);
}
