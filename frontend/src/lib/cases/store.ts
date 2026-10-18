"use client";
import { create } from "zustand";
import type { SourcingCase, Stage } from "./types";
import { seedCases } from "./seed";

interface CaseState {
  cases: Record<string, SourcingCase>;
  byPart: (partId: string) => SourcingCase | undefined;
  createCase: (partId: string, profileId: string, owner: SourcingCase["owner"]) => SourcingCase;
  setStage: (caseId: string, stage: Stage, who: string) => void;
  pin: (caseId: string, supplierId: string, who: string) => void;
  unpin: (caseId: string, supplierId: string, who: string) => void;
}

/**
 * Shared case state: explorer, shortlist board, chat actions and the train map all read and write here.
 * Client-side for the demo; persist through /api/cases when multiplayer needs it.
 */
export const useCases = create<CaseState>((set, get) => ({
  cases: Object.fromEntries(seedCases.map((c) => [c.id, c])),
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
  setStage: (caseId, stage, who) =>
    set((s) => {
      const c = s.cases[caseId];
      if (!c) return s;
      return { cases: { ...s.cases, [caseId]: { ...c, stage, log: [...c.log, { at: new Date().toISOString(), who, what: `stage -> ${stage}` }], updatedAt: new Date().toISOString() } } };
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
