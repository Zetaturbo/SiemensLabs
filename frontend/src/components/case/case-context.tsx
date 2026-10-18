"use client";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useCases } from "@/lib/cases/store";
import type { SourcingCase } from "@/lib/cases/types";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import trainParts from "@/config/train-parts.json";
import { FALLBACK_METADATA, normalizeMetadata, normalizeProfiles, type Metadata, type Profile, type SupplierRow } from "./domain";

const CaseIdContext = createContext<string | null>(null);

export function CaseProvider({ caseId, children }: { caseId: string; children: ReactNode }) {
  return <CaseIdContext.Provider value={caseId}>{children}</CaseIdContext.Provider>;
}

export function useCaseId(): string {
  const id = useContext(CaseIdContext);
  if (!id) throw new Error("useCaseId outside CaseProvider");
  return id;
}

export function useCurrentCase(): SourcingCase | undefined {
  const id = useCaseId();
  return useCases((s) => s.cases[id]);
}

export interface TrainPart {
  id: string;
  label: string;
  group: string;
  profile: string;
  criticality: string;
}

export const PARTS: TrainPart[] = (trainParts as { parts: TrainPart[] }).parts;

export function partById(partId: string | undefined): TrainPart | undefined {
  return PARTS.find((p) => p.id === partId);
}

/** get_metadata merged over fallbacks; never null. */
export function useMetadata(): { meta: Metadata; loading: boolean } {
  const { data, loading } = useDataTool<unknown>("get_metadata", {});
  const meta = useMemo(() => (data ? normalizeMetadata(data) : FALLBACK_METADATA), [data]);
  return { meta, loading };
}

/** list_profiles merged over fallbacks; never empty. */
export function useProfiles(): { profiles: Profile[]; loading: boolean } {
  const { data, loading } = useDataTool<unknown>("list_profiles", {});
  const profiles = useMemo(() => normalizeProfiles(data), [data]);
  return { profiles, loading };
}

/** Basic rows (name, TRI, metrics) for a set of ids via get_suppliers; keyed by supplier_id. */
export function useSupplierRows(ids: string[]): { rows: Record<string, SupplierRow>; loading: boolean } {
  const sorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const { data, loading } = useDataTool<{ suppliers?: SupplierRow[] }>(
    "get_suppliers",
    sorted.length ? { ids: sorted, fields: ["supplier_name", "total_risk_index", "total_risk_index_level", "delivery_rating", "po_volume_eur", "sourcing_risk_level"] } : null,
  );
  const rows = useMemo(() => Object.fromEntries((data?.suppliers ?? []).filter((r) => r && typeof r.supplier_id === "string").map((r) => [r.supplier_id, r])), [data]);
  return { rows, loading };
}

export function supplierName(rows: Record<string, SupplierRow>, id: string): string {
  const n = rows[id]?.supplier_name;
  return typeof n === "string" && n ? n : id;
}

export function useProfile(profileId: string | undefined): Profile | undefined {
  const { profiles } = useProfiles();
  return profiles.find((p) => p.profile_id === profileId);
}
