"use client";
import { useMemo } from "react";
import { useCases } from "./store";
import { TEAM, type TeamMember } from "./team";
import type { Presence, SourcingCase } from "./types";

/**
 * Multiplayer selectors over the case store. The pure functions take store slices (usable anywhere);
 * the hooks subscribe to the slice and memoize, so components re-render only when it changes.
 */

export interface PersonHere extends TeamMember {
  lastSeen: string;
}

export interface ActivityEntry {
  at: string;
  who: string;
  what: string;
  caseId: string;
  partId: string;
}

/** People currently in a case, most recently active first. */
export function peopleInCase(presence: Record<string, Presence>, caseId: string): PersonHere[] {
  return TEAM.filter((m) => presence[m.id]?.caseId === caseId)
    .map((m) => ({ ...m, lastSeen: presence[m.id].lastSeen }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

/** Everyone online (in some case), with the case they are in, most recently active first. */
export function peopleOnline(presence: Record<string, Presence>): Array<PersonHere & { caseId: string }> {
  return TEAM.filter((m) => presence[m.id]?.caseId)
    .map((m) => ({ ...m, lastSeen: presence[m.id].lastSeen, caseId: presence[m.id].caseId as string }))
    .sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}

/** The newest log entries across all cases (default 10), newest first. */
export function recentActivity(cases: Record<string, SourcingCase>, limit = 10): ActivityEntry[] {
  return Object.values(cases)
    .flatMap((c) => c.log.map((l) => ({ ...l, caseId: c.id, partId: c.partId })))
    .sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0))
    .slice(0, limit);
}

export function usePeopleInCase(caseId: string): PersonHere[] {
  const presence = useCases((s) => s.presence);
  return useMemo(() => peopleInCase(presence, caseId), [presence, caseId]);
}

export function usePeopleOnline(): Array<PersonHere & { caseId: string }> {
  const presence = useCases((s) => s.presence);
  return useMemo(() => peopleOnline(presence), [presence]);
}

export function useRecentActivity(limit = 10): ActivityEntry[] {
  const cases = useCases((s) => s.cases);
  return useMemo(() => recentActivity(cases, limit), [cases, limit]);
}
