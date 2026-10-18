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

export interface Opening {
  status: string;
  hint: string;
}

/** "Brake system · shortlist · 6 pinned · next: compare the top 3" plus one short hint. */
export function openingMessage(c: SourcingCase, part?: TrainPart): Opening {
  const name = part?.label ?? c.partId;
  const pinned = c.stage === "finalists" || c.stage === "awarded" ? `${c.finalists.length} finalists` : `${c.shortlist.length} pinned`;
  const status = `${name} · ${stageLabel(c.stage)} · ${pinned} · next: ${nextStep(c)}`;
  const hint =
    c.stage === "long_list" || c.stage === "none"
      ? c.hardRequirements.length
        ? "Filters are set from the profile. Ask for suppliers, or change what matters."
        : "Ask what matters, or describe the suppliers you need."
      : c.stage === "shortlist"
        ? "Ask me to compare, explain or find alternatives."
        : c.stage === "finalists"
          ? "Ask for research on a finalist or the award memo."
          : "Ask for the memo or a second look at the winner.";
  return { status, hint };
}

/**
 * Stage-appropriate prompts in priority order. The chat shows the first three the buyer has not sent yet,
 * so the extra ones are refills.
 */
export function stageSuggestions(c: SourcingCase, part?: TrainPart): string[] {
  const noun = partNoun(c, part);
  const profile = profileName(c.profileId);
  const filter = "Show me suppliers without a critical quality score and delivery above 95";
  const matters = `Which filters matter when procuring ${noun}?`;
  const first = c.shortlist[0];
  switch (c.stage) {
    case "none":
    case "long_list":
      return c.hardRequirements.length
        ? [filter, matters, `Rank the matching suppliers with the ${profile} profile`, "How many suppliers have a Critical quality score?"]
        : [matters, filter, `Rank suppliers with the ${profile} profile`, "How many suppliers have a Critical quality score?"];
    case "shortlist":
      return c.shortlist.length >= 3
        ? ["Compare my top 3", "Which of my shortlist has the lowest financial risk?", `Why is ${first} rated this way?`, `Find alternatives to ${first}`]
        : [filter, matters, `Rank my shortlist with the ${profile} profile`, ...(first ? [`Why is ${first} rated this way?`, `Find alternatives to ${first}`] : [])];
    case "finalists":
      return ["Compare the finalists", "Which finalist has the lowest financial risk?", "Draft the award memo"];
    case "awarded":
      return ["Draft the award memo", `Why is ${c.awardedSupplier ?? "the winner"} rated this way?`, "Find alternatives to the awarded supplier"];
  }
}
