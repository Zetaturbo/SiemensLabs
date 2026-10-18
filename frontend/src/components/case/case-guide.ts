import { SUPPLIER_NAMES } from "@/lib/cases/seed";
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
      return "set filters";
    case "long_list":
      return c.hardRequirements.length ? "pin candidates" : "set filters";
    case "shortlist":
      return c.shortlist.length >= 3 ? "compare the top 3" : "pin candidates";
    case "finalists":
      return "award";
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

export const supplierName = (id: string) => SUPPLIER_NAMES[id] ?? id;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
};

/** Finalists whose research has finished (log: "research finished on SUPP_x: ..."). */
export function researchDone(c: SourcingCase): string[] {
  const done = new Set<string>();
  for (const e of c.log) {
    const m = /^research finished on (SUPP_\d+)/.exec(e.what);
    if (m && c.finalists.includes(m[1])) done.add(m[1]);
  }
  return [...done];
}

/** When the case was awarded: the decision, else the latest "awarded" log entry. */
function awardedAt(c: SourcingCase): string {
  if (c.decision && c.decision.supplier === c.awardedSupplier) return c.decision.at;
  return [...c.log].reverse().find((e) => e.what.startsWith("awarded "))?.at ?? c.updatedAt;
}

/** The seeded matching count, only while the filters are still the ones it was counted for. */
const matchingCount = (c: SourcingCase) => (c.matching && c.matching.filtersKey === JSON.stringify(c.hardRequirements) ? c.matching.count : null);

/**
 * One line from the case's stage, built locally without an LLM call:
 *   not started  "Not started · next: set filters"
 *   long list    "7,594 matching · nothing pinned · next: pin candidates"
 *   shortlist    "Brake system · shortlist · 6 pinned · next: compare the top 3"
 *   finalists    "3 finalists · research done for 2 · next: award"
 *   awarded      "Awarded to Global Industries 127 · 19 Sep · 3 finalists"
 */
export function openingMessage(c: SourcingCase, part?: TrainPart): string {
  const name = part?.label ?? c.partId;
  switch (c.stage) {
    case "none":
      return "Not started · next: set filters";
    case "long_list": {
      if (c.hardRequirements.length === 0) return `${name} · long list · No filters yet. Ask what matters.`;
      const n = matchingCount(c);
      const pinned = c.shortlist.length ? `${c.shortlist.length} pinned` : "nothing pinned";
      return `${n !== null ? `${n.toLocaleString("en-US")} matching · ` : ""}${pinned} · next: ${nextStep(c)}`;
    }
    case "shortlist":
      return `${name} · shortlist · ${c.shortlist.length} pinned · next: ${nextStep(c)}`;
    case "finalists":
      return `${c.finalists.length} finalists · research done for ${researchDone(c).length} · next: ${nextStep(c)}`;
    case "awarded": {
      const winner = c.awardedSupplier ? `Awarded to ${supplierName(c.awardedSupplier)}` : "Awarded";
      return [winner, shortDate(awardedAt(c)), `${c.finalists.length} finalists`].filter(Boolean).join(" · ");
    }
  }
}

/**
 * Stage-appropriate prompts, at most three. The workflow the model sees carries the shortlist but not the
 * finalists or the award, so chips that refer to them name the ids.
 */
export function stageSuggestions(c: SourcingCase, part?: TrainPart): string[] {
  const noun = partNoun(c, part);
  const first = c.shortlist[0];
  const filter = "Suppliers without critical quality, delivery above 95";
  const matters = `What matters for ${noun}?`;
  switch (c.stage) {
    case "none":
      return [matters, "Show matching suppliers", "Pin the top 5"];
    case "long_list":
      return c.hardRequirements.length ? ["Show matching suppliers", "Pin the top 5"] : [matters, "Show matching suppliers", "Pin the top 5"];
    case "shortlist":
      return c.shortlist.length >= 3
        ? ["Compare my top 3", "Lowest financial risk in my shortlist?", `Why is ${first} rated so?`, `Alternatives to ${first}`]
        : [filter, matters, "Rank my shortlist", ...(first ? [`Why is ${first} rated so?`, `Alternatives to ${first}`] : [])];
    case "finalists": {
      const top = c.finalists[0];
      return [`Compare the finalists ${c.finalists.join(", ")}`, ...(top ? [`Research ${supplierName(top)} (${top})`] : []), "Award the best"];
    }
    case "awarded": {
      const w = c.awardedSupplier;
      // Names the id: "this supplier" alone resolves to the selected supplier, which the case screen does not set.
      return [w ? `Why ${supplierName(w)} (${w})?` : "Why this supplier?", "Show the decision memo", "Reopen the case"];
    }
  }
}
