"use client";
import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { useCases } from "@/lib/cases/store";
import { useHydrated } from "./store";

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

/** Activity of the selected part's cases, collapsed inside the part panel. */
export function ActivityFeed({ partId }: { partId: string }) {
  const cases = useCases((s) => s.cases);
  const hydrated = useHydrated();
  const entries = useMemo(
    () =>
      Object.values(cases)
        .filter((c) => c.partId === partId)
        .flatMap((c) => c.log.map((l) => ({ ...l, caseId: c.id })))
        .sort((a, b) => (a.at < b.at ? 1 : -1))
        .slice(0, 8),
    [cases, partId],
  );

  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1 rounded-md text-2xs font-medium tracking-[0.06em] text-tertiary uppercase select-none hover:text-subtext [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-3.5 transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden />
        Activity
        <span className="tabular font-mono tracking-normal">{entries.length}</span>
      </summary>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-subtext">No activity on this part yet.</p>
      ) : (
        <ul className="mt-1.5">
          {entries.map((e, i) => (
            <li key={`${e.caseId}-${e.at}-${i}`} className="flex items-baseline justify-between gap-3 py-1.5">
              <span className="min-w-0 text-sm text-ink">
                <span className="font-medium">{e.who}</span> <span className="text-subtext">{e.what}</span>
              </span>
              {hydrated && <When at={e.at} />}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}
