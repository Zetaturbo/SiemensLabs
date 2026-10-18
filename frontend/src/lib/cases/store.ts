"use client";
import { create } from "zustand";
import type { Presence, SourcingCase, Stage } from "./types";
import { seedCases, seedPresence } from "./seed";
import { TEAM, memberById } from "./team";

interface CaseState {
  cases: Record<string, SourcingCase>;
  byPart: (partId: string) => SourcingCase | undefined;
  createCase: (partId: string, profileId: string, owner: SourcingCase["owner"]) => SourcingCase;
  setStage: (caseId: string, stage: Stage, who: string) => void;
  pin: (caseId: string, supplierId: string, who: string) => void;
  unpin: (caseId: string, supplierId: string, who: string) => void;
  /** Team id -> where that person is (case id or null = offline) and when they were last active. Not persisted. */
  presence: Record<string, Presence>;
  /** Put a team member into a case (null = offline); refreshes their lastSeen. */
  moveTo: (personId: string, caseId: string | null) => void;
}

/**
 * Shared case state: explorer, shortlist board, chat actions and the train map all read and write here.
 * Client-side for the demo; persist through /api/cases when multiplayer needs it.
 */
export const useCases = create<CaseState>((set, get) => ({
  cases: Object.fromEntries(seedCases.map((c) => [c.id, c])),
  presence: seedPresence(),
  moveTo: (personId, caseId) =>
    set((s) => (memberById(personId) ? { presence: { ...s.presence, [personId]: { caseId, lastSeen: new Date().toISOString() } } } : s)),
  byPart: (partId) => Object.values(get().cases).find((c) => c.partId === partId),
  createCase: (partId, profileId, owner) => {
    const c: SourcingCase = {
      id: `case_${partId}`,
      partId,
      stage: "long_list",
      owner,
      profileId,
      hardRequirements: [],
      shortlist: [],
      finalists: [],
      awardedSupplier: null,
      linkedEntities: {},
      riskSummary: { level: null, flagCount: 0 },
      log: [{ at: new Date().toISOString(), who: owner?.name ?? "system", what: "case created" }],
      updatedAt: new Date().toISOString(),
    };
    set((s) => ({ cases: { ...s.cases, [c.id]: c } }));
    return c;
  },
  // Keeps the award coherent with the stage: leaving "awarded" withdraws the award (and its decision);
  // reaching it without a winner awards the first finalist (the seed keeps finalists in profile rank order).
  setStage: (caseId, stage, who) =>
    set((s) => {
      const c = s.cases[caseId];
      if (!c) return s;
      const at = new Date().toISOString();
      const log = [...c.log, { at, who, what: `stage -> ${stage}` }];
      let award: Partial<SourcingCase> = {};
      if (stage !== "awarded" && c.awardedSupplier) {
        log.push({ at, who, what: `award to ${c.awardedSupplier} withdrawn` });
        award = { awardedSupplier: null, decision: undefined };
      } else if (stage === "awarded" && !c.awardedSupplier && c.finalists[0]) {
        log.push({ at, who, what: `awarded ${c.finalists[0]}` });
        award = { awardedSupplier: c.finalists[0] };
      }
      return { cases: { ...s.cases, [caseId]: { ...c, ...award, stage, log, updatedAt: at } } };
    }),
  pin: (caseId, supplierId, who) =>
    set((s) => {
      const c = s.cases[caseId];
      if (!c || c.shortlist.includes(supplierId) || c.shortlist.length >= 20) return s;
      return { cases: { ...s.cases, [caseId]: { ...c, shortlist: [...c.shortlist, supplierId], log: [...c.log, { at: new Date().toISOString(), who, what: `pinned ${supplierId}` }], updatedAt: new Date().toISOString() } } };
    }),
  unpin: (caseId, supplierId, who) =>
    set((s) => {
      const c = s.cases[caseId];
      if (!c) return s;
      return { cases: { ...s.cases, [caseId]: { ...c, shortlist: c.shortlist.filter((id) => id !== supplierId), log: [...c.log, { at: new Date().toISOString(), who, what: `unpinned ${supplierId}` }], updatedAt: new Date().toISOString() } } };
    }),
}));

// ------------------------------------------------------------------ presence drift (demo)

/** mulberry32: a seeded PRNG, so the drift follows the same sequence on every load. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Cases a person plausibly opens: buyers their own cases, the category manager open decisions, the risk analyst research. */
function plausibleCases(personId: string, cases: SourcingCase[]): string[] {
  const m = memberById(personId);
  if (!m) return [];
  if (personId === "sophie") return cases.filter((c) => c.stage === "shortlist" || c.stage === "finalists" || c.stage === "awarded").map((c) => c.id);
  if (personId === "david") return cases.filter((c) => c.finalists.length > 0 || Object.keys(c.linkedEntities).length > 0).map((c) => c.id);
  return cases.filter((c) => c.owner?.name === m.name).map((c) => c.id);
}

let drifting = false;

/**
 * Simulated multiplayer: every 20 to 40 s one team member moves to another case they would plausibly open.
 * One timer chain, started once on the client (idempotent).
 */
export function startPresenceDrift() {
  if (drifting || typeof window === "undefined") return;
  drifting = true;
  const rand = prng(0x5eed);
  const tick = () => {
    const { cases, presence, moveTo } = useCases.getState();
    const person = TEAM[Math.floor(rand() * TEAM.length)];
    const options = plausibleCases(person.id, Object.values(cases)).filter((id) => id !== presence[person.id]?.caseId);
    if (options.length) moveTo(person.id, options[Math.floor(rand() * options.length)]);
    window.setTimeout(tick, 20_000 + Math.floor(rand() * 20_000));
  };
  window.setTimeout(tick, 20_000 + Math.floor(rand() * 20_000));
}

startPresenceDrift();
