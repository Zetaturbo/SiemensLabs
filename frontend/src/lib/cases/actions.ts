"use client";
import { useCases } from "./store";
import type { SourcingCase, Stage } from "./types";
import type { FilterCondition } from "@/lib/data-api/types";

/**
 * Case actions on top of the zustand store in ./store.ts (kept untouched). Every action writes a
 * log entry, because procurement decisions (and exclusion reasons in particular) must be documented.
 *
 * Log conventions the memo and the chat can parse:
 *   "dropped SUPP_00012: <reason>"           exclusion with reason
 *   "advanced SUPP_00012 to finalists"
 *   "linked SUPP_00012 to <legal name>; research will start"
 *   "awarded SUPP_00012"
 *   "hard requirements: <n> rules"           (coalesced while the buyer edits filters)
 *   "profile -> <profile_id>"
 *   "stage -> <stage>"                       (store.setStage)
 */

export const STAGE_ORDER: Stage[] = ["none", "long_list", "shortlist", "finalists", "awarded"];
export const stageIndex = (s: Stage) => STAGE_ORDER.indexOf(s);

type Patch = Partial<SourcingCase> | ((c: SourcingCase) => Partial<SourcingCase>);

function now() {
  return new Date().toISOString();
}

function update(caseId: string, who: string, what: string | null, patch: Patch, opts: { coalesce?: RegExp } = {}) {
  useCases.setState((s) => {
    const c = s.cases[caseId];
    if (!c) return s;
    const p = typeof patch === "function" ? patch(c) : patch;
    let log = c.log;
    if (what) {
      const last = log[log.length - 1];
      const recent = last && Date.now() - Date.parse(last.at) < 120_000 && last.who === who;
      log = opts.coalesce && recent && opts.coalesce.test(last.what) ? [...log.slice(0, -1), { at: now(), who, what }] : [...log, { at: now(), who, what }];
    }
    return { cases: { ...s.cases, [caseId]: { ...c, ...p, log, updatedAt: now() } } };
  });
}

/** Move the case forward to `stage` if it is behind it (never moves backwards). */
export function ensureStage(caseId: string, stage: Stage, who: string) {
  const c = useCases.getState().cases[caseId];
  if (c && stageIndex(c.stage) < stageIndex(stage)) useCases.getState().setStage(caseId, stage, who);
}

export function setProfile(caseId: string, profileId: string, who: string) {
  const c = useCases.getState().cases[caseId];
  if (!c || c.profileId === profileId) return;
  update(caseId, who, `profile -> ${profileId}`, { profileId });
}

export function setHardRequirements(caseId: string, conditions: FilterCondition[], who: string, note?: string) {
  const c = useCases.getState().cases[caseId];
  if (!c || JSON.stringify(c.hardRequirements) === JSON.stringify(conditions)) return;
  update(caseId, who, `hard requirements: ${conditions.length} rules${note ? ` (${note})` : ""}`, { hardRequirements: conditions }, { coalesce: /^hard requirements:/ });
}

/** Pin to the shortlist (max 20, enforced by the store) and open the shortlist stage. */
export function pinToShortlist(caseId: string, supplierId: string, who: string) {
  useCases.getState().pin(caseId, supplierId, who);
  ensureStage(caseId, "shortlist", who);
}

export function advanceToFinalists(caseId: string, supplierId: string, who: string) {
  const c = useCases.getState().cases[caseId];
  if (!c || c.finalists.includes(supplierId)) return;
  update(caseId, who, `advanced ${supplierId} to finalists`, (x) => ({
    finalists: [...x.finalists, supplierId],
    shortlist: x.shortlist.includes(supplierId) ? x.shortlist : [...x.shortlist, supplierId],
  }));
  ensureStage(caseId, "finalists", who);
}

/** Back from finalists to the shortlist without dropping the supplier. */
export function returnToShortlist(caseId: string, supplierId: string, who: string) {
  update(caseId, who, `returned ${supplierId} to shortlist`, (x) => ({ finalists: x.finalists.filter((id) => id !== supplierId) }));
}

/** Remove from shortlist and finalists; the reason goes into the case log for the award memo. */
export function dropWithReason(caseId: string, supplierId: string, reason: string, who: string) {
  const clean = reason.trim().replace(/\s+/g, " ") || "no reason given";
  update(caseId, who, `dropped ${supplierId}: ${clean}`, (x) => ({
    shortlist: x.shortlist.filter((id) => id !== supplierId),
    finalists: x.finalists.filter((id) => id !== supplierId),
    awardedSupplier: x.awardedSupplier === supplierId ? null : x.awardedSupplier,
  }));
}

export type LinkedEntity = SourcingCase["linkedEntities"][string];

/**
 * Link a supplier to a real legal entity. Research starts from this (research_company is the
 * research agent's job); here we only record the link and a log entry the research flow can pick up.
 */
export function linkEntity(caseId: string, supplierId: string, entity: LinkedEntity, who: string) {
  update(caseId, who, `linked ${supplierId} to ${entity.legal_name}${entity.country ? ` (${entity.country})` : ""}; research will start`, (x) => ({
    linkedEntities: { ...x.linkedEntities, [supplierId]: entity },
  }));
}

export function unlinkEntity(caseId: string, supplierId: string, who: string) {
  update(caseId, who, `unlinked legal entity from ${supplierId}`, (x) => {
    const rest = { ...x.linkedEntities };
    delete rest[supplierId];
    return { linkedEntities: rest };
  });
}

/** Set the research job id once the research agent has accepted the job. */
export function setResearchJob(caseId: string, supplierId: string, jobId: string, who: string) {
  update(caseId, who, `research job ${jobId} for ${supplierId}`, (x) => {
    const e = x.linkedEntities[supplierId];
    return e ? { linkedEntities: { ...x.linkedEntities, [supplierId]: { ...e, job_id: jobId } } } : {};
  });
}

export function award(caseId: string, supplierId: string, who: string, riskLevel?: SourcingCase["riskSummary"]["level"]) {
  update(caseId, who, `awarded ${supplierId}`, (x) => ({
    awardedSupplier: supplierId,
    finalists: x.finalists.includes(supplierId) ? x.finalists : [...x.finalists, supplierId],
    riskSummary: { ...x.riskSummary, level: riskLevel ?? x.riskSummary.level },
  }));
  ensureStage(caseId, "awarded", who);
}

export function withdrawAward(caseId: string, who: string) {
  const c = useCases.getState().cases[caseId];
  if (!c?.awardedSupplier) return;
  update(caseId, who, `award to ${c.awardedSupplier} withdrawn`, { awardedSupplier: null });
  useCases.getState().setStage(caseId, "finalists", who);
}

// ------------------------------------------------------------------ parsed log

export interface Exclusion {
  supplierId: string;
  reason: string;
  at: string;
  who: string;
}

export function exclusions(c: SourcingCase): Exclusion[] {
  const out: Exclusion[] = [];
  for (const e of c.log) {
    const m = /^dropped (\S+): (.*)$/.exec(e.what);
    if (m) out.push({ supplierId: m[1], reason: m[2], at: e.at, who: e.who });
  }
  return out;
}

/** True once the buyer (or a preset) has set requirements since the case was created or reset. */
export function requirementsTouched(c: SourcingCase): boolean {
  for (let i = c.log.length - 1; i >= 0; i--) {
    const w = c.log[i].what;
    if (w.startsWith("hard requirements")) return true;
    if (w === "case reset" || w === "case created") return false;
  }
  return c.hardRequirements.length > 0;
}

// ------------------------------------------------------------------ persistence (demo)

const STORAGE_KEY = "srm.cases.v1";
let persisting = false;

/**
 * Restore cases from localStorage and keep saving them, so a reload during the demo keeps the
 * shortlist. Idempotent; call from any client entry point (case screens, train map).
 */
export function startCasePersistence() {
  if (persisting || typeof window === "undefined") return;
  persisting = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Record<string, SourcingCase>;
      if (saved && typeof saved === "object") useCases.setState((s) => ({ cases: { ...s.cases, ...saved } }));
    }
  } catch {
    // storage unavailable or corrupt: start from seed
  }
  useCases.subscribe((s) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s.cases));
    } catch {
      // ignore quota / privacy mode
    }
  });
}

/** Reset one case to a fresh long list (demo helper). */
export function resetCase(caseId: string, who: string) {
  update(caseId, who, "case reset", {
    stage: "long_list",
    hardRequirements: [],
    shortlist: [],
    finalists: [],
    awardedSupplier: null,
    linkedEntities: {},
    riskSummary: { level: null, flagCount: 0 },
  });
}
