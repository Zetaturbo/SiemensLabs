import { SUPPLIER_NAMES } from "@/lib/cases/seed";
import type { SourcingCase, Stage } from "@/lib/cases/types";
import type { TrainPart } from "./case-context";

/**
 * Stage-derived copy for the chat-first case screen: the progress bar's "Next" action, the locally built
 * opening message, the suggestion chips and the case log phrasing. Pure, so the screen and tests can share it.
 */

export type LoggedStage = Exclude<Stage, "none">;

export const STAGE_STEPS: Array<{ stage: LoggedStage; label: string }> = [
  { stage: "long_list", label: "Long list" },
  { stage: "shortlist", label: "Shortlist" },
  { stage: "finalists", label: "Finalists" },
  { stage: "awarded", label: "Awarded" },
];

export const stageLabel = (s: Stage) => (s === "none" ? "not started" : (STAGE_STEPS.find((x) => x.stage === s)?.label.toLowerCase() ?? s));

export const groupLabel = (group: string) => group.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

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
export const shortDate = (iso: string) => {
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
 * One line from the case's stage, built locally without an LLM call. The next step is not part of the line:
 * it is the primary chip under the message (nextQuestion) and the "Next" action of the progress bar.
 *   not started  "Cab HMI · not started"
 *   long list    "7,594 matching · nothing pinned"
 *   shortlist    "Brake system · shortlist · 6 pinned"
 *   finalists    "3 finalists · research done for 2"
 *   awarded      "Awarded to Global Industries 127 · 19 Sep · 3 finalists"
 */
export function openingMessage(c: SourcingCase, part?: TrainPart): string {
  const name = part?.label ?? c.partId;
  switch (c.stage) {
    case "none":
      return `${name} · not started`;
    case "long_list": {
      if (c.hardRequirements.length === 0) return `${name} · long list · no filters yet`;
      const n = matchingCount(c);
      const pinned = c.shortlist.length ? `${c.shortlist.length} pinned` : "nothing pinned";
      return `${n !== null ? `${n.toLocaleString("en-US")} matching · ` : ""}${pinned}`;
    }
    case "shortlist":
      return `${name} · shortlist · ${c.shortlist.length} pinned`;
    case "finalists":
      return `${c.finalists.length} finalists · research done for ${researchDone(c).length}`;
    case "awarded": {
      const winner = c.awardedSupplier ? `Awarded to ${supplierName(c.awardedSupplier)}` : "Awarded";
      return [winner, shortDate(awardedAt(c)), `${c.finalists.length} finalists`].filter(Boolean).join(" · ");
    }
  }
}

/**
 * The single most useful next question for the case's stage, sendable as is: the progress bar's "Next" action
 * and the opening message's primary chip. After each answer the model proposes the next one itself.
 */
export function nextQuestion(c: SourcingCase, part?: TrainPart): string {
  const matters = `What matters for ${partNoun(c, part)}?`;
  switch (c.stage) {
    case "none":
      return matters;
    case "long_list":
      if (!c.hardRequirements.length) return matters;
      return c.shortlist.length >= 3 ? "Compare my top 3" : "Show matching suppliers";
    case "shortlist":
      return c.shortlist.length >= 3 ? "Compare my top 3" : "Show matching suppliers";
    case "finalists":
      return "Compare the finalists";
    case "awarded":
      return "Why this supplier?";
  }
}

/**
 * Secondary prompts for the stage, without the primary one (the chat shows at most two). They name no ids:
 * the workflow context carries the shortlist, the finalists and the award, and the prompt resolves
 * "my top pick", "the top finalist" and "this supplier" from it.
 */
export function stageSuggestions(c: SourcingCase, part?: TrainPart): string[] {
  const matters = `What matters for ${partNoun(c, part)}?`;
  const filter = "Suppliers without critical quality, delivery above 95";
  const primary = nextQuestion(c, part);
  let all: string[];
  switch (c.stage) {
    case "none":
      all = [matters, "Show matching suppliers", "Pin the top 5"];
      break;
    case "long_list":
      all = c.hardRequirements.length ? ["Show matching suppliers", "Pin the top 5", matters] : [matters, "Show matching suppliers", "Pin the top 5"];
      break;
    case "shortlist":
      all =
        c.shortlist.length >= 3
          ? ["Lowest financial risk in my shortlist?", "Why is my top pick rated so?", "Alternatives to my top pick"]
          : [filter, matters, "Rank my shortlist", ...(c.shortlist.length ? ["Why is my top pick rated so?"] : [])];
      break;
    case "finalists":
      all = ["Research the top finalist", "Award the best"];
      break;
    case "awarded":
      all = ["Show the decision memo", "Reopen the case"];
      break;
  }
  return all.filter((q) => q !== primary);
}

// ------------------------------------------------------------------ case log: stages and phrasing

export type LogEntry = SourcingCase["log"][number];

/** The stage a log entry documents; null for entries that belong to whatever stage the case was in (comments). */
function stageOfEntry(what: string): LoggedStage | null {
  const moved = /^stage -> (\w+)/.exec(what);
  if (moved) return moved[1] === "none" ? "long_list" : (moved[1] as LoggedStage);
  if (/^(case created|hard requirements|profile ->)/.test(what)) return "long_list";
  if (/^(pinned|unpinned|compared|dropped)/.test(what)) return "shortlist";
  if (/^(finalists chosen|advanced|research|linked)/.test(what)) return "finalists";
  if (/^(awarded|approved)/.test(what)) return "awarded";
  return null;
}

/** The case log split by stage, in log order: what happened while the case was in each stage. */
export function logByStage(c: SourcingCase): Record<LoggedStage, LogEntry[]> {
  const out: Record<LoggedStage, LogEntry[]> = { long_list: [], shortlist: [], finalists: [], awarded: [] };
  let current: LoggedStage = "long_list";
  for (const e of c.log) {
    current = stageOfEntry(e.what) ?? current;
    out[current].push(e);
  }
  return out;
}

const idsIn = (s: string) => s.match(/SUPP_\d{5}/g) ?? [];
const nameOf = (id: string | undefined) => (id ? supplierName(id) : "a supplier");

/** A log entry as a short phrase for activity lists: "pinned 3", "awarded Global Industries 127". */
export function describeLog(what: string): string {
  const ids = idsIn(what);
  const head = what.split(":")[0];
  if (what === "case created") return "opened the case";
  if (head.startsWith("hard requirements")) return `set ${/(\d+) rules?/.exec(head)?.[1] ?? "the"} filters`;
  if (what.startsWith("profile ->")) return "changed the profile";
  if (what.startsWith("stage ->")) return `moved to ${stageLabel(what.replace("stage -> ", "").trim() as Stage)}`;
  if (what.startsWith("unpinned")) return `unpinned ${ids.length}`;
  if (what.startsWith("pinned")) return `pinned ${ids.length}`;
  if (what.startsWith("compared")) return `compared the top ${ids.length || 3}`;
  if (what.startsWith("dropped")) return `dropped ${nameOf(ids[0])}`;
  if (what.startsWith("research requested")) return "requested research";
  if (what.startsWith("research started")) return "started research";
  if (what.startsWith("research finished")) return `finished research on ${nameOf(ids[0])}`;
  if (what.startsWith("linked")) return `linked ${nameOf(ids[0])}`;
  if (what.startsWith("finalists chosen")) return `chose ${ids.length} finalists`;
  if (what.startsWith("advanced")) return `advanced ${nameOf(ids[0])}`;
  if (what.startsWith("approved")) return "approved the award";
  if (what.startsWith("awarded")) return `awarded ${nameOf(ids[0])}`;
  if (what.startsWith("award to")) return "withdrew the award";
  if (what.startsWith("comment")) return "commented";
  return head.length > 40 ? `${head.slice(0, 39)}…` : head;
}

/** "now", "4 min", "3 h", "2 d", "5 wk" from an ISO time. */
export function relativeTime(iso: string, now = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const min = Math.max(0, Math.round((now - t) / 60_000));
  if (min < 1) return "now";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} d` : `${Math.round(d / 7)} wk`;
}
