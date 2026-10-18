"use client";
import { useMemo, useState, type ReactNode } from "react";
import { Check, Copy, Download, Sparkles } from "lucide-react";
import { Alert, Badge, Button, Card, Tooltip } from "@/design-system/react";
import { exclusions } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { partById, useCurrentCase, useMetadata, useProfile } from "./case-context";
import { fmtEur, fmtNum, type CompareResult } from "./domain";
import { buildMemo, memoToMarkdown, type CandidateStatus } from "./memo";
import { ErrorNote, LevelChip, MockBadge, Spinner, ui } from "./primitives";
import { useCaseUi } from "./ui-store";

const STATUS: Record<CandidateStatus, { label: string; tone: "success" | "neutral" | "outline" }> = {
  awarded: { label: "Awarded", tone: "success" },
  finalist: { label: "Finalist", tone: "neutral" },
  shortlisted: { label: "Shortlisted", tone: "outline" },
  dropped: { label: "Dropped", tone: "outline" },
};

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-subtle pt-5">
      <h3 className="mb-2 text-md font-semibold">
        <span className="mr-2 font-mono text-subtext">{n}.</span>
        {title}
      </h3>
      <div className="text-base leading-relaxed text-ink">{children}</div>
    </section>
  );
}

/** Award recommendation built from case state; markdown export now, AI drafting later. */
export function MemoView() {
  const c = useCurrentCase();
  const { meta } = useMetadata();
  const profile = useProfile(c?.profileId);
  const openSupplier = useCaseUi((s) => s.openSupplier);
  const [copied, setCopied] = useState(false);
  const profileId = c?.profileId ?? "default";

  const candidateIds = useMemo(() => {
    if (!c) return [];
    const all = new Set([...(c.awardedSupplier ? [c.awardedSupplier] : []), ...c.finalists, ...c.shortlist, ...exclusions(c).map((d) => d.supplierId)]);
    return [...all].slice(0, 20).sort();
  }, [c]);
  const finalistIds = useMemo(() => [...(c?.finalists ?? [])].sort(), [c?.finalists]);
  const candidates = useDataTool<CompareResult>("compare_suppliers", candidateIds.length ? { ids: candidateIds, profile_id: profileId } : null);
  const finalists = useDataTool<CompareResult>("compare_suppliers", finalistIds.length > 1 ? { ids: finalistIds, profile_id: profileId } : null);
  const part = partById(c?.partId);

  const memo = useMemo(
    () => (c ? buildMemo({ c, meta, profile, partLabel: part?.label ?? c.partId, criticality: part?.criticality ?? null, candidates: candidates.data, finalists: finalists.data }) : null),
    [c, meta, profile, part, candidates.data, finalists.data],
  );
  if (!c || !memo) return null;
  const markdown = memoToMarkdown(memo);
  const nameOf = (id: string | null) => memo.candidates.find((x) => x.id === id)?.name ?? id ?? "–";
  const loading = candidates.loading || finalists.loading;

  const download = () => {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${c.id}-award-memo-${memo.date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Award memo</h2>
        {loading && <Spinner />}
        <MockBadge meta={candidates.meta} />
        <div className="ml-auto flex items-center gap-1.5">
          <Tooltip label="Drafts the memo with the chat's shortlist_memo skill (coming with the chat panel)" side="bottom">
            <Button size="sm" variant="secondary" leading={<Sparkles />} disabled>
              Generate with AI
            </Button>
          </Tooltip>
          <Button
            size="sm"
            variant="ghost"
            leading={copied ? <Check /> : <Copy />}
            onClick={() => {
              navigator.clipboard?.writeText(markdown).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? "Copied" : "Copy markdown"}
          </Button>
          <Button size="sm" variant="primary" leading={<Download />} onClick={download}>
            Export .md
          </Button>
        </div>
      </div>
      <ErrorNote error={candidates.error} what="compare_suppliers" />

      <Card variant="elevated" className="mx-auto max-w-3xl px-10 py-9">
        <header>
          <div className={ui.eyebrow}>Sourcing decision · {memo.stage === "awarded" ? "final" : "draft"}</div>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.02em]">{memo.title}</h1>
          <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1.5 text-sm sm:grid-cols-3">
            {[
              ["Case", <span key="c" className="font-mono">{memo.caseId}</span>],
              ["Part", `${memo.part}${memo.criticality ? ` (${memo.criticality})` : ""}`],
              ["Weight profile", memo.profile],
              ["Owner", memo.owner],
              ["Stage", memo.stage.replace("_", " ")],
              ["Date", <span key="d" className="font-mono">{memo.date}</span>],
            ].map(([k, v]) => (
              <div key={String(k)}>
                <dt className="text-tertiary">{k}</dt>
                <dd className="text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div className="mt-6 space-y-6">
          <Section n={1} title="Recommendation">
            {memo.recommendation ? (
              <>
                <Alert tone={memo.recommendation.basis === "awarded" ? "success" : "neutral"} title={`${memo.recommendation.basis === "awarded" ? "Awarded to" : "Proposed award to"} ${memo.recommendation.name}`}>
                  <span className="font-mono text-xs">{memo.recommendation.id}</span>
                  {memo.recommendation.basis === "proposed" && <span className="text-subtext"> · best profile score among the finalists; not yet awarded</span>}
                </Alert>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {memo.rationale.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                {memo.watchPoints.length > 0 && (
                  <>
                    <div className={`${ui.eyebrow} mt-4`}>Watch points</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5">
                      {memo.watchPoints.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            ) : (
              <p className="text-subtext">No finalist yet. The recommendation follows once suppliers reach the finalist stage.</p>
            )}
          </Section>

          <Section n={2} title="Requirements">
            <p>
              Weight profile <strong className="font-semibold">{memo.profile}</strong>
              {memo.profileDescription ? `: ${memo.profileDescription}` : "."}
            </p>
            {memo.requirements.length ? (
              <ul className="mt-2 list-disc space-y-0.5 pl-5">
                {memo.requirements.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-subtext">No hard requirements set.</p>
            )}
          </Section>

          <Section n={3} title="Candidates evaluated">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-subtle text-left text-2xs uppercase tracking-wide text-tertiary">
                  <th className="py-1.5 pr-2 font-medium">Supplier</th>
                  <th className="py-1.5 pr-2 font-medium">Status</th>
                  <th className="py-1.5 pr-2 font-medium">TRI</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Score</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Delivery</th>
                  <th className="py-1.5 text-right font-medium">Volume</th>
                </tr>
              </thead>
              <tbody>
                {memo.candidates.map((x) => (
                  <tr key={x.id} className="border-b border-subtle last:border-0">
                    <td className="py-1.5 pr-2">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => openSupplier(x.id)}>
                        {x.name}
                      </button>
                      <div className="font-mono text-2xs text-tertiary">{x.id}</div>
                    </td>
                    <td className="py-1.5 pr-2">
                      <Badge size="sm" tone={STATUS[x.status].tone}>
                        {STATUS[x.status].label}
                      </Badge>
                    </td>
                    <td className="py-1.5 pr-2">
                      <LevelChip score={x.tri} level={x.level} />
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{fmtNum(x.profileScore, 1)}</td>
                    <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{x.delivery !== null ? `${fmtNum(x.delivery, 1)}%` : "–"}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{fmtEur(x.volume)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!memo.candidates.length && <p className="text-subtext">No suppliers on the shortlist yet.</p>}
          </Section>

          <Section n={4} title="Deciding factors">
            {memo.factors.length ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-subtle text-left text-2xs uppercase tracking-wide text-tertiary">
                    <th className="py-1.5 pr-2 font-medium">Dimension</th>
                    <th className="py-1.5 pr-2 font-medium">Best</th>
                    <th className="py-1.5 pr-2 font-medium">Worst</th>
                    <th className="py-1.5 text-right font-medium">Spread</th>
                  </tr>
                </thead>
                <tbody>
                  {memo.factors.map((f) => (
                    <tr key={f.field} className="border-b border-subtle last:border-0">
                      <td className="py-1.5 pr-2">{f.label}</td>
                      <td className="py-1.5 pr-2">
                        {nameOf(f.best)} <span className="font-mono text-subtext">{fmtNum(f.bestValue, 1)}</span>
                      </td>
                      <td className="py-1.5 pr-2">
                        {nameOf(f.worst)} <span className="font-mono text-subtext">{fmtNum(f.worstValue, 1)}</span>
                      </td>
                      <td className="py-1.5 text-right font-mono tabular-nums">{fmtNum(f.spread, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-subtext">Compare at least two suppliers to see deciding factors.</p>
            )}
          </Section>

          <Section n={5} title="Exclusions">
            {memo.candidates.some((x) => x.status === "dropped") ? (
              <ul className="list-disc space-y-1 pl-5">
                {memo.candidates
                  .filter((x) => x.status === "dropped")
                  .map((x) => (
                    <li key={x.id}>
                      <strong className="font-semibold">{x.name}</strong> <span className="font-mono text-xs text-subtext">{x.id}</span>: {x.reason ?? "no reason recorded"}
                    </li>
                  ))}
              </ul>
            ) : (
              <p className="text-subtext">No supplier was dropped from the shortlist.</p>
            )}
          </Section>

          <Section n={6} title="Public-record research">
            {memo.research.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {memo.research.map((r) => (
                  <li key={r.id}>
                    {r.name}: {r.entity ? `${r.entity}, research ${r.status}` : <span className="text-subtext">no legal entity linked</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-subtext">None.</p>
            )}
          </Section>

          <Section n={7} title="Process log">
            <ol className="space-y-0.5 text-sm">
              {memo.history.map((h, i) => (
                <li key={i} className="grid grid-cols-[8.5rem_6rem_1fr] gap-2">
                  <span className="font-mono text-xs text-tertiary">{h.at.slice(0, 16).replace("T", " ")}</span>
                  <span className="truncate text-subtext">{h.who}</span>
                  <span>{h.what}</span>
                </li>
              ))}
            </ol>
          </Section>

          <Section n={8} title="Limitations">
            <ul className="list-disc space-y-1 pl-5 text-subtext">
              {memo.limitations.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </Section>
        </div>
      </Card>
    </div>
  );
}
