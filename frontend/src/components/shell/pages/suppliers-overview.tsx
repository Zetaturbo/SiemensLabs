"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, MessageSquare } from "lucide-react";
import { Card, SearchInput, Skeleton } from "@/design-system/react";
import { useDataTool } from "@/lib/hooks/use-data-tool";

interface StatsData {
  stats?: Array<{ field: string; count?: number; level_counts?: Record<string, number> | null }>;
  countries?: number;
}
interface ProfilesData {
  profiles?: Array<{ profile_id: string }>;
}

const STATS_INPUT = { fields: ["total_risk_index"], conditions: [] };
const nf = new Intl.NumberFormat("en-US");

/** Search entry point plus the dataset at a glance (get_dataset_stats and list_profiles via /api/data). */
export function SuppliersOverview() {
  const [query, setQuery] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const stats = useDataTool<StatsData>("get_dataset_stats", STATS_INPUT);
  const profiles = useDataTool<ProfilesData>("list_profiles", {});
  const tri = stats.data?.stats?.find((s) => s.field === "total_risk_index");
  const suppliers = tri?.count ?? (tri?.level_counts ? Object.values(tri.level_counts).reduce((a, b) => a + b, 0) : null);
  const countries = typeof stats.data?.countries === "number" ? stats.data.countries : null;

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            setAsked(query.trim() || null);
          }}
        >
          <SearchInput
            aria-label="Search suppliers"
            placeholder="Search by supplier ID or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            inputSize="lg"
          />
        </form>
        <p className="flex items-center gap-1.5 text-sm text-subtext">
          <MessageSquare aria-hidden className="size-3.5 text-tertiary" />
          {asked ? (
            <span>
              Ask in a case to query suppliers, for example “{asked}” in the brake system case.
            </span>
          ) : (
            <span>Ask in a case to query suppliers. The case chat filters, ranks and compares them with the case profile.</span>
          )}
        </p>
      </section>

      <section aria-label="Dataset" className="grid grid-cols-3 gap-3">
        <StatTile label="Suppliers" value={suppliers} loading={stats.loading} note="Risk profiles in the dataset" />
        <StatTile label="Countries" value={countries} loading={stats.loading} note={countries == null ? "Not in the dataset; set per case" : "Supplier locations"} />
        <StatTile label="Profiles" value={profiles.data?.profiles?.length ?? null} loading={profiles.loading} note="Weighting profiles for ranking" />
      </section>

      <Card className="flex items-center justify-between gap-4 px-4 py-3.5">
        <div className="min-w-0">
          <div className="text-base font-medium text-ink">Brake system</div>
          <div className="text-sm text-subtext">Safety-critical profile · the live sourcing case</div>
        </div>
        <Link
          href="/cases/case_brake_system"
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-fg shadow-xs outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
        >
          Open case <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Card>
    </div>
  );
}

function StatTile({ label, value, note, loading }: { label: string; value: number | null; note: string; loading: boolean }) {
  return (
    <Card className="px-4 py-3.5">
      <div className="text-sm text-subtext">{label}</div>
      <div className="mt-1 h-8 font-mono text-2xl font-medium tabular-nums text-ink">
        {loading ? <Skeleton className="mt-1 h-6 w-20" /> : value == null ? <span className="text-tertiary">–</span> : nf.format(value)}
      </div>
      <div className="mt-0.5 text-xs text-tertiary">{note}</div>
    </Card>
  );
}
