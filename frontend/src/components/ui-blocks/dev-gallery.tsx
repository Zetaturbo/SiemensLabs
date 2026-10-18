"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Renderer } from "@openuidev/react-lang";
import { SegmentedControl, Tabs } from "@/design-system/react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { describeUiAction, type UiAction } from "@/components/chat/ui-actions";
import { useCases } from "@/lib/cases/store";
import { primeResults } from "@/lib/hooks/use-result";
import { library, normalizeResponse } from "@/lib/openui/library";
import { BlockEnvProvider } from "./block-context";
import { FIXTURES, REVIEW, STATE_FIXTURES, type ReviewState } from "./fixtures";
import { RiskFlagListView } from "./risk-flag-list";

// Fixtures go into the result cache before the first render (server and client), so blocks render immediately.
primeResults(FIXTURES);
primeResults(STATE_FIXTURES);

const DEV_CASE = "case_doors";
const STATE_LABEL: Record<ReviewState, string> = { many: "Many rows", one: "One row", empty: "Empty result" };

type Theme = "light" | "dark";
const subscribeTheme = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const readTheme = (): Theme => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = next;
  try {
    localStorage.setItem("sri.theme", next);
  } catch {}
}

/** One state: OpenUI Lang through the real Renderer, or a research job snapshot rendered directly. */
function Snippet({ source, job, label }: { source?: string; job?: string; label: string }) {
  return (
    <div className="grid min-w-0 content-start gap-2">
      <p className="text-sm text-tertiary" title={source ?? job}>
        {label}
      </p>
      {job ? <RiskFlagListView data={STATE_FIXTURES[job]} /> : source ? <Renderer response={normalizeResponse(source)} library={library} /> : null}
    </div>
  );
}

/**
 * /dev/blocks, the review page: every block through the real OpenUI Renderer in three states of its result
 * shape (many rows, one row, empty), plus extra states (research jobs, expired handle). Switch the theme at the
 * top, or open /dev/blocks?theme=dark. The Chat tab has the chat panel (live route or demo switch).
 */
export function DevBlocksGallery() {
  const [tab, setTab] = useState<"blocks" | "chat">("blocks");
  const [log, setLog] = useState<string[]>([]);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as Theme);
  const shortlist = useCases((s) => s.cases[DEV_CASE]?.shortlist ?? []);
  const record = useCallback((a: UiAction) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${describeUiAction(a)}`, ...l].slice(0, 12)), []);
  const ask = useCallback((text: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ask: ${text}`, ...l].slice(0, 12)), []);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("theme");
    if (q === "dark" || q === "light") setTheme(q);
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">UI blocks</h1>
          <p className="text-sm text-subtext">
            Every block in three states of its result shape. Pins go to <span className="font-mono">{DEV_CASE}</span> (<span className="tabular font-mono">{shortlist.length}</span>{" "}
            shortlisted).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SegmentedControl
            size="sm"
            items={[
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            value={theme}
            onValueChange={(v) => setTheme(v as Theme)}
          />
          <Tabs
            items={[
              { value: "blocks", label: "Review" },
              { value: "chat", label: "Chat" },
            ]}
            value={tab}
            onValueChange={setTab}
          />
        </div>
      </div>

      {tab === "blocks" ? (
        <BlockEnvProvider caseId={DEV_CASE} who="dev" dispatch={record} ask={ask}>
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_200px]">
            <div className="grid min-w-0 gap-12">
              {REVIEW.map((entry, i) => (
                <section key={i} className="grid min-w-0 gap-4" data-review={entry.block}>
                  <h2 className="flex items-baseline gap-3 border-b border-subtle pb-2">
                    <span className="font-mono text-base font-semibold text-ink">{entry.block}</span>
                    <span className="text-sm text-subtext">{entry.label}</span>
                  </h2>
                  <div className="max-w-4xl">
                    <Snippet source={entry.states.many} label={entry.labels?.many ?? STATE_LABEL.many} />
                  </div>
                  <div className="grid max-w-4xl gap-4 md:grid-cols-2">
                    <Snippet source={entry.states.one} label={entry.labels?.one ?? STATE_LABEL.one} />
                    <Snippet source={entry.states.empty} label={entry.labels?.empty ?? STATE_LABEL.empty} />
                    {entry.extra?.map((x) => (
                      <Snippet key={x.label} source={x.source} job={x.job} label={x.label.charAt(0).toUpperCase() + x.label.slice(1)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <aside className="hidden xl:sticky xl:top-16 xl:block xl:self-start">
              <p className="mb-2 text-sm font-medium text-subtext">Action log</p>
              <ul className="space-y-1 font-mono text-sm text-subtext">
                {log.length ? log.map((l, i) => <li key={i}>{l}</li>) : <li className="font-sans">Click a supplier, pin, or Apply.</li>}
              </ul>
            </aside>
          </div>
        </BlockEnvProvider>
      ) : (
        <div className="h-[78vh] overflow-hidden rounded-xl border border-line">
          <ChatPanel caseId={DEV_CASE} onAction={record} />
        </div>
      )}
    </div>
  );
}
