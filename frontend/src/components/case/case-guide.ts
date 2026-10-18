import type { SourcingCase, Stage } from "@/lib/cases/types";
import type { TrainPart } from "./case-context";

/**
 * Stage-derived copy for the chat-first case screen: the rail's "Next" line, the locally built
 * opening message and the three suggestion chips. Pure, so the screen and tests can share it.
 */

export const STAGE_STEPS: Array<{ stage: Exclude<Stage, "none">; label: string }> = [
  { stage: "long_list", label: "Long list" },
  { stage: "shortlist", label: "Shortlist" },
  { stage: "finalists", label: "Finalists" },
  { stage: "awarded", label: "Awarded" },
];

export const stageLabel = (s: Stage) => (s === "none" ? "not started" : (STAGE_STEPS.find((x) => x.stage === s)?.label.toLowerCase() ?? s));

export const groupLabel = (group: string) => group.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export function nextStep(c: SourcingCase): string {
  switch (c.stage) {
    case "none":
    case "long_list":
      return c.hardRequirements.length ? "pin candidates" : "set filters";
    case "shortlist":
      return c.shortlist.length >= 3 ? "compare the top 3" : "pin candidates";
    case "finalists":
      return "run research, then award";
    case "awarded":
      return "share the award memo";
  }
}

/** How the buyer would name the part in a question ("brakes", not "brake system"). */
const NOUN: Record<string, string> = {
  brake_system: "brakes",
  bogie_wheelsets: "bogies and wheelsets",
  car_body: "car bodies",
  traction_motors: "traction motors",
  traction_converter: "traction converters",
  pantograph: "pantographs",
  couplers: "couplers",
  doors: "passenger doors",
  hvac: "HVAC units",
  train_control: "train control systems",
  cab_hmi: "cab HMI",
  battery_aux: "batteries",
  interiors: "interiors",
};

export const partNoun = (c: SourcingCase, part?: TrainPart) => NOUN[c.partId] ?? part?.label.toLowerCase() ?? c.partId.replace(/_/g, " ");

const PROFILE_NAME: Record<string, string> = {
  safety_critical: "safety-critical",
  strategic_system: "strategic system",
  commodity: "commodity",
  lksg_due_diligence: "LkSG due diligence",
  default: "default",
};

export const profileName = (id: string) => PROFILE_NAME[id] ?? id.replace(/_/g, " ");

/**
 * One line: "Brake system · shortlist · 6 pinned · next: compare the top 3".
 * Without filters on the long list it carries the filter bar's empty state instead of the next step.
 */
export function openingMessage(c: SourcingCase, part?: TrainPart): string {
  const name = part?.label ?? c.partId;
  const early = c.stage === "long_list" || c.stage === "none";
  if (early && c.hardRequirements.length === 0) return `${name} · ${stageLabel(c.stage)} · No filters yet. Ask what matters.`;
  const pinned = c.stage === "finalists" || c.stage === "awarded" ? `${c.finalists.length} finalists` : `${c.shortlist.length} pinned`;
  return `${name} · ${stageLabel(c.stage)} · ${pinned} · next: ${nextStep(c)}`;
}

/**
 * Stage-appropriate prompts in priority order. The chat shows the first three the buyer has not sent yet,
 * so the extra ones are refills.
 */
export function stageSuggestions(c: SourcingCase, part?: TrainPart): string[] {
  const noun = partNoun(c, part);
  const profile = profileName(c.profileId);
  const filter = "Suppliers without critical quality, delivery above 95";
  const matters = `What matters for ${noun}?`;
  const first = c.shortlist[0];
  const winner = c.awardedSupplier ?? "the winner";
  switch (c.stage) {
    case "none":
    case "long_list":
      return c.hardRequirements.length
        ? [filter, matters, `Rank with the ${profile} profile`, "How many have critical quality?"]
        : [matters, filter, `Rank with the ${profile} profile`, "How many have critical quality?"];
    case "shortlist":
      return c.shortlist.length >= 3
        ? ["Compare my top 3", "Lowest financial risk in my shortlist?", `Why is ${first} rated so?`, `Alternatives to ${first}`]
        : [filter, matters, "Rank my shortlist", ...(first ? [`Why is ${first} rated so?`, `Alternatives to ${first}`] : [])];
    case "finalists":
      return ["Compare the finalists", "Lowest financial risk among finalists?", "Draft the award memo"];
    case "awarded":
      return ["Draft the award memo", `Why ${winner}?`, `Alternatives to ${winner}`];
  }
}
