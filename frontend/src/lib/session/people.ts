"use client";
import { useMemo } from "react";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { currentUser } from "./current-user";
import { TEAM } from "@/lib/cases/team";

/**
 * People in the workspace, as the shell shows them (team page, presence avatars in the top bar).
 *
 * Source of truth is the roster in src/lib/cases/team.ts (`TEAM`) and the presence slice of the case
 * store (`presence: Record<personId, { caseId, lastSeen }>`, read by `peopleOnline` in
 * src/lib/cases/selectors.ts). Until both exist on this branch, the roster falls back to the case
 * owners and "online" to the owners of the most recently updated cases. When team.ts lands, set
 * `ROSTER = TEAM` below (one import); the presence path already reads `presence` when the store has it.
 */
export interface Person {
  id: string;
  name: string;
  initials: string;
  department: string;
  role: string;
}

export interface OnlinePerson extends Person {
  caseId: string;
  lastSeen: string;
}

interface Presence {
  caseId: string | null;
  lastSeen: string;
}

/** The roster from src/lib/cases/team.ts once it exists (TeamMember is a superset of Person). */
const ROSTER: Person[] | null = TEAM;

/** Roster ids are the lower-case first name ("Lena K." -> "lena"), as in team.ts. */
const idOf = (name: string) => name.trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z]/g, "");
const initialsOf = (name: string) => {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return p.length > 1 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : (p[0] ?? "?").slice(0, 2).toUpperCase();
};

/** Case owners as people, plus the signed-in user when they own nothing yet. */
export function rosterFromCases(cases: SourcingCase[]): Person[] {
  const byId = new Map<string, Person>();
  for (const c of cases) {
    if (!c.owner) continue;
    const id = idOf(c.owner.name);
    if (!byId.has(id)) byId.set(id, { id, name: c.owner.name, initials: initialsOf(c.owner.name), department: c.owner.department, role: "Buyer" });
  }
  if (!byId.has(currentUser.id)) {
    byId.set(currentUser.id, { id: currentUser.id, name: currentUser.name, initials: currentUser.initials, department: currentUser.department, role: currentUser.role });
  }
  return [...byId.values()];
}

export function sortByUpdated(cases: SourcingCase[]): SourcingCase[] {
  return [...cases].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.partId.localeCompare(b.partId)));
}

const selectCases = (s: ReturnType<typeof useCases.getState>) => s.cases;
/** The presence slice, when the store has one (the case-states branch adds it). */
const selectPresence = (s: ReturnType<typeof useCases.getState>) => (s as unknown as { presence?: Record<string, Presence> }).presence;

export function useCaseList(): SourcingCase[] {
  const cases = useCases(selectCases);
  return useMemo(() => sortByUpdated(Object.values(cases)), [cases]);
}

export function useRecentCases(n = 3): SourcingCase[] {
  const list = useCaseList();
  return useMemo(() => list.slice(0, n), [list, n]);
}

export interface PersonWithCases extends Person {
  casesOwned: SourcingCase[];
}

/** Everyone on the roster with the cases they own (owner name match). */
export function usePeople(): PersonWithCases[] {
  const list = useCaseList();
  return useMemo(() => {
    const roster = ROSTER ?? rosterFromCases(list);
    return roster.map((p) => ({ ...p, casesOwned: list.filter((c) => c.owner?.name === p.name || (c.owner && idOf(c.owner.name) === p.id)) }));
  }, [list]);
}

/** People with a case open, most recently active first. Falls back to the owners of the latest cases. */
export function useOnlinePeople(): OnlinePerson[] {
  const list = useCaseList();
  const presence = useCases(selectPresence);
  return useMemo(() => {
    const roster = ROSTER ?? rosterFromCases(list);
    if (presence) {
      return roster
        .filter((p) => presence[p.id]?.caseId)
        .map((p) => ({ ...p, caseId: presence[p.id].caseId as string, lastSeen: presence[p.id].lastSeen }))
        .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
    }
    const seen = new Set<string>();
    const out: OnlinePerson[] = [];
    for (const c of list) {
      if (!c.owner) continue;
      const p = roster.find((r) => r.name === c.owner?.name || r.id === idOf(c.owner?.name ?? ""));
      if (!p || seen.has(p.id) || p.id === currentUser.id) continue;
      seen.add(p.id);
      out.push({ ...p, caseId: c.id, lastSeen: c.updatedAt });
      if (out.length === 3) break;
    }
    return out;
  }, [list, presence]);
}
