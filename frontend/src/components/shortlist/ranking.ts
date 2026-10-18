"use client";
import { useMemo } from "react";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import type { SourcingCase } from "@/lib/cases/types";
import type { RankEntry, RankResult } from "@/components/case/domain";

export interface ShortlistRanking {
  /** The pinned ids, best profile score first (as pinned while the ranking loads). */
  order: string[];
  byId: Map<string, RankEntry>;
  loading: boolean;
  error: string | null;
}

/**
 * The case's shortlist ranked with its profile (rank_with_profile on the pinned ids). The board's columns, its
 * Continue step and the progress bar's Next step all read this one result (same input, one cached request).
 */
export function useShortlistRanking(c: Pick<SourcingCase, "shortlist" | "profileId">): ShortlistRanking {
  const ids = useMemo(() => [...c.shortlist].sort(), [c.shortlist]);
  const rank = useDataTool<RankResult>("rank_with_profile", ids.length ? { ids, profile_id: c.profileId, limit: 20 } : null);
  return useMemo(() => {
    const byId = new Map((rank.data?.ranking ?? []).filter((r) => c.shortlist.includes(r.supplier_id)).map((r) => [r.supplier_id, r]));
    const ranked = [...byId.values()].sort((a, b) => a.rank - b.rank).map((r) => r.supplier_id);
    const order = [...ranked, ...c.shortlist.filter((id) => !byId.has(id))];
    return { order, byId, loading: rank.loading, error: rank.error?.message ?? null };
  }, [rank.data, rank.loading, rank.error, c.shortlist]);
}
