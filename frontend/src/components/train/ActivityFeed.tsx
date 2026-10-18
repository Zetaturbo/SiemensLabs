"use client";
import { useEffect, useMemo, useState } from "react";
import { useCases } from "@/lib/cases/store";
import { PART_BY_ID } from "./config";
import { useHydrated, useTrainUi } from "./store";

function useNow(intervalMs: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

function ago(at: string, now: number) {
  const s = Math.max(0, Math.round((now - Date.parse(at)) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(at).toLocaleDateString();
}

function When({ at }: { at: string }) {
  const now = useNow(30_000);
  return (
    <time dateTime={at} className="tabular shrink-0 font-mono text-2xs text-tertiary">
      {ago(at, now)}
    </time>
  );
}

/** Last 8 log entries across all cases. */
export function ActivityFeed() {
  const cases = useCases((s) => s.cases);
  const select = useTrainUi((s) => s.select);
  const hydrated = useHydrated();
  const entries = useMemo(
    () =>
      Object.values(cases)
        .flatMap((c) => c.log.map((l) => ({ ...l, caseId: c.id, partId: c.partId })))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 8),
    [cases],
  );

  return (
    <section className="border-t border-line p-4">
      <h2 className="text-2xs font-medium tracking-[0.06em] text-tertiary uppercase">Activity</h2>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-subtext">No activity yet. Create a case on a part to start one.</p>
      ) : (
        <ul className="-mx-2 mt-1.5">
          {entries.map((e, i) => (
            <li key={`${e.caseId}-${e.at}-${i}`}>
              <button
                type="button"
                onClick={() => select(e.partId, { fly: true })}
                className="flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-hover"
              >
                <span className="min-w-0 text-sm text-ink">
                  <span className="font-medium">{e.who}</span> <span className="text-subtext">{e.what}</span>
                  <span className="block truncate text-xs text-subtext">{PART_BY_ID[e.partId]?.label ?? e.partId}</span>
                </span>
                {hydrated && <When at={e.at} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
