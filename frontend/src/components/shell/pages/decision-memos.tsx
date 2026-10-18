"use client";
import Link from "next/link";
import { FileText } from "lucide-react";
import { Avatar } from "@/design-system/react";
import { useCaseList } from "@/lib/session/people";
import { EmptyState } from "../page";
import { partLabel, relativeTime } from "../nav";
import { useNow } from "../use-now";

/** One memo per awarded case; opens the case, where the memo is generated from the case log. */
export function DecisionMemos() {
  const awarded = useCaseList().filter((c) => c.stage === "awarded");
  const now = useNow();
  if (!awarded.length) return <EmptyState title="No awarded cases yet" body="A decision memo appears here once a case is awarded." />;
  return (
    <ul className="divide-y divide-subtle">
      {awarded.map((c) => {
        const decision = (c as { decision?: { supplier?: string; rationale?: string } }).decision;
        return (
          <li key={c.id}>
            <Link href={`/cases/${c.id}`} className="flex items-center gap-3 px-4 py-3 outline-none transition-colors hover:bg-hover focus-visible:bg-hover">
              <FileText aria-hidden className="size-[18px] shrink-0 text-tertiary" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-base font-medium text-ink">{partLabel(c.partId)}: award memo</div>
                <div className="truncate text-sm text-subtext">
                  Awarded to <span className="font-mono">{decision?.supplier ?? c.awardedSupplier ?? "–"}</span>
                  {decision?.rationale ? ` · ${decision.rationale}` : ""}
                </div>
              </div>
              {c.owner && <Avatar name={c.owner.name} size="xs" className="rounded-full" title={c.owner.name} />}
              <span className="w-20 shrink-0 text-right text-sm text-tertiary">{now ? relativeTime(c.updatedAt, now) : ""}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
