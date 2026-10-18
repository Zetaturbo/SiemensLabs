"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Avatar, Card, StatusDot, TBody, THead, Table, Td, Th, Tr, cn } from "@/design-system/react";
import type { Stage } from "@/lib/cases/types";
import { useCaseList } from "@/lib/session/people";
import { PARTS, STAGE_LABEL, STAGE_TONE, partLabel, relativeTime } from "../nav";
import { useNow } from "../use-now";

const FILTERS: Array<Stage | "all"> = ["all", "none", "long_list", "shortlist", "finalists", "awarded"];

interface Row {
  id: string;
  partId: string;
  stage: Stage;
  owner: string | null;
  pinned: number;
  finalists: number;
  updatedAt: string | null;
}

/** Every train part's sourcing case, most recently updated first; parts without a case show as not started. */
export function CasesList() {
  const router = useRouter();
  const cases = useCaseList();
  const now = useNow();
  const [filter, setFilter] = useState<Stage | "all">("all");

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = cases.map((c) => ({
      id: c.id,
      partId: c.partId,
      stage: c.stage,
      owner: c.owner?.name ?? null,
      pinned: c.shortlist.length,
      finalists: c.finalists.length,
      updatedAt: c.updatedAt,
    }));
    for (const p of PARTS) {
      if (!cases.some((c) => c.partId === p.id)) {
        out.push({ id: `case_${p.id}`, partId: p.id, stage: "none", owner: null, pinned: 0, finalists: 0, updatedAt: null });
      }
    }
    return out;
  }, [cases]);

  const counts = useMemo(() => {
    const m: Record<string, number> = { all: rows.length };
    for (const r of rows) m[r.stage] = (m[r.stage] ?? 0) + 1;
    return m;
  }, [rows]);

  const shown = filter === "all" ? rows : rows.filter((r) => r.stage === filter);

  return (
    <>
      <div role="group" aria-label="Filter by stage" className="mb-3 flex flex-wrap items-center gap-1.5">
        {FILTERS.map((f) => {
          const on = filter === f;
          return (
            <button
              key={f}
              type="button"
              aria-pressed={on}
              onClick={() => setFilter(f)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]",
                on ? "border-strong bg-active font-medium text-ink" : "border-line text-subtext hover:bg-hover hover:text-ink",
              )}
            >
              {f !== "all" && <StatusDot size="sm" tone={STAGE_TONE[f]} />}
              {f === "all" ? "All" : STAGE_LABEL[f]}
              <span className="font-mono text-xs tabular-nums text-tertiary">{counts[f] ?? 0}</span>
            </button>
          );
        })}
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="pl-4">Part</Th>
              <Th>Stage</Th>
              <Th>Owner</Th>
              <Th className="text-right">Pinned</Th>
              <Th className="text-right">Finalists</Th>
              <Th className="pr-4 text-right">Updated</Th>
            </tr>
          </THead>
          <TBody>
            {shown.map((r) => (
              <Tr key={r.id} className="cursor-pointer" onClick={() => router.push(`/cases/${r.id}`)}>
                <Td className="pl-4">
                  <Link
                    href={`/cases/${r.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded-sm font-medium text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--lw-focus-ring)]"
                  >
                    {partLabel(r.partId)}
                  </Link>
                </Td>
                <Td>
                  <StatusDot size="sm" tone={STAGE_TONE[r.stage]} label={STAGE_LABEL[r.stage]} />
                </Td>
                <Td>
                  {r.owner ? (
                    <span className="flex items-center gap-2">
                      <Avatar name={r.owner} size="xs" className="rounded-full" />
                      <span className="text-subtext">{r.owner}</span>
                    </span>
                  ) : (
                    <span className="text-tertiary">Unassigned</span>
                  )}
                </Td>
                <Td className="text-right font-mono tabular-nums text-subtext">{r.pinned}</Td>
                <Td className="text-right font-mono tabular-nums text-subtext">{r.finalists}</Td>
                <Td className="pr-4 text-right text-sm text-subtext">{r.updatedAt && now ? relativeTime(r.updatedAt, now) : "–"}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
        {shown.length === 0 && <div className="px-4 py-10 text-center text-base text-subtext">No cases in this stage.</div>}
      </Card>
    </>
  );
}
