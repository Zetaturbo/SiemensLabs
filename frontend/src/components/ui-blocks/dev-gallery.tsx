"use client";
import { useCallback, useState } from "react";
import { Renderer } from "@openuidev/react-lang";
import { Badge, CodeBlock, Tabs } from "@/design-system/react";
import { ChatPanel } from "@/components/chat/chat-panel";
import { describeUiAction, type UiAction } from "@/components/chat/ui-actions";
import { useCases } from "@/lib/cases/store";
import { primeResults } from "@/lib/hooks/use-result";
import { library, normalizeResponse } from "@/lib/openui/library";
import { BlockEnvProvider } from "./block-context";
import { FIXTURES, GALLERY } from "./fixtures";

// Fixtures go into the result cache before the first render (server and client), so blocks render immediately.
primeResults(FIXTURES);

const DEV_CASE = "case_doors";

/** /dev/blocks: every block rendered through the OpenUI Renderer against fixture results, plus the chat panel (live route or demo switch). */
export function DevBlocksGallery() {
  const [tab, setTab] = useState<"blocks" | "chat">("blocks");
  const [log, setLog] = useState<string[]>([]);
  const shortlist = useCases((s) => s.cases[DEV_CASE]?.shortlist ?? []);
  const record = useCallback((a: UiAction) => setLog((l) => [`${new Date().toLocaleTimeString()}  ${describeUiAction(a)}`, ...l].slice(0, 12)), []);
  const ask = useCallback((text: string) => setLog((l) => [`${new Date().toLocaleTimeString()}  ask: ${text}`, ...l].slice(0, 12)), []);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">UI blocks</h1>
          <p className="text-sm text-subtext">
            Each block renders from its OpenUI Lang snippet through the real Renderer. Pins go to <span className="font-mono">{DEV_CASE}</span> (
            <span className="tabular font-mono">{shortlist.length}</span> shortlisted).
          </p>
        </div>
        <Tabs
          items={[
            { value: "blocks", label: "Blocks" },
            { value: "chat", label: "Chat" },
          ]}
          value={tab}
          onValueChange={setTab}
        />
      </div>

      {tab === "blocks" ? (
        <BlockEnvProvider caseId={DEV_CASE} who="dev" dispatch={record} ask={ask}>
          <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
            <div className="grid min-w-0 gap-6">
              {GALLERY.map((g, i) => (
                <section key={i} className="grid min-w-0 gap-2">
                  <div className="flex items-center gap-2">
                    <Badge size="sm" tone="outline" className="font-mono">
                      {g.block}
                    </Badge>
                    <span className="text-xs text-subtext">{g.note}</span>
                  </div>
                  <CodeBlock code={g.source} language="openui-lang" copyable={false} className="text-xs" />
                  <div className="max-w-2xl">
                    <Renderer response={normalizeResponse(g.source)} library={library} />
                  </div>
                </section>
              ))}
            </div>
            <aside className="lg:sticky lg:top-16 lg:self-start">
              <p className="mb-1 text-2xs font-medium uppercase tracking-wide text-tertiary">Action log</p>
              <ul className="space-y-1 font-mono text-2xs text-subtext">
                {log.length ? log.map((l, i) => <li key={i}>{l}</li>) : <li>Click a supplier, Research, Explain or Pin.</li>}
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
