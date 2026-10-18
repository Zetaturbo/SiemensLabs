import fs from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import { Card, CardHeader } from "@/design-system/react";
import { EmptyState, PageBody, PageHeader } from "@/components/shell/page";
import { DecisionMemos } from "@/components/shell/pages/decision-memos";

export const metadata: Metadata = { title: "Reports · Supplier Risk Intelligence" };

interface EvalRun {
  model?: string;
  questions?: number;
  graded?: number;
  correct?: number;
  accuracy?: number;
  args_correct?: string;
  errors?: number;
  ttft_ms?: { median?: number; p90?: number };
  ran_at?: string;
}

/** Eval summaries written by the eval runners (evals/<name>/last-run.json); read at build time. */
function readRuns(candidates: string[]): { file: string; runs: EvalRun[]; ranAt?: string } | null {
  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const rel = path.relative(process.cwd(), file);
      const json = JSON.parse(fs.readFileSync(file, "utf8")) as { runs?: EvalRun[]; ran_at?: string } & EvalRun;
      const runs = Array.isArray(json.runs) ? json.runs : [json];
      return { file: rel, runs: runs.map(({ model, questions, graded, correct, accuracy, args_correct, errors, ttft_ms, ran_at }) => ({ model, questions, graded, correct, accuracy, args_correct, errors, ttft_ms, ran_at })), ranAt: json.ran_at };
    } catch {
      // unreadable result file: treat as missing
    }
  }
  return null;
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function ReportsPage() {
  // Static paths so the build traces only these files.
  const routing = readRuns([path.join(process.cwd(), "evals", "routing", "last-run.json")]);
  const answer = readRuns([
    path.join(process.cwd(), "evals", "answer", "last-run.json"),
    path.join(process.cwd(), "evals", "answers", "last-run.json"),
    path.join(process.cwd(), "evals", "routing", "answer-last-run.json"),
  ]);
  return (
    <PageBody>
      <PageHeader title="Reports" context="Copilot quality checks and the decisions taken in this workspace." />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <EvalCard title="Routing eval" description="Does the copilot pick the right skill for a question?" data={routing} />
          <EvalCard title="Answer eval" description="Are the copilot's answers grounded and complete?" data={answer} />
        </div>
        <Card>
          <CardHeader title="Decision memos" description="Award justifications from awarded cases." />
          <DecisionMemos />
        </Card>
      </div>
    </PageBody>
  );
}

function EvalCard({ title, description, data }: { title: string; description: string; data: ReturnType<typeof readRuns> }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={title}
        description={description}
        action={data?.ranAt ? <span className="text-sm text-tertiary">{dateFmt.format(new Date(data.ranAt))}</span> : undefined}
      />
      {data ? (
        <div className="flex flex-col divide-y divide-subtle border-t border-subtle">
          {data.runs.map((r, i) => (
            <div key={r.model ?? i} className="flex items-center gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm text-ink">{r.model?.replace(/^nvidia\//, "") ?? "model"}</div>
                <div className="text-xs text-tertiary">
                  {r.args_correct ? `arguments ${r.args_correct}` : null}
                  {r.ttft_ms?.median != null ? ` · first token ${(r.ttft_ms.median / 1000).toFixed(1)} s median` : null}
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xl font-medium tabular-nums text-ink">
                  {r.correct ?? "–"}
                  <span className="text-tertiary">/{r.graded ?? r.questions ?? "–"}</span>
                </div>
                <div className="text-xs text-tertiary">{r.accuracy != null ? `${r.accuracy} % correct` : "correct"}</div>
              </div>
            </div>
          ))}
          <div className="px-4 py-2 font-mono text-xs text-tertiary">{data.file}</div>
        </div>
      ) : (
        <div className="border-t border-subtle">
          <EmptyState title="No results yet" body="Run the eval to see a summary here." />
        </div>
      )}
    </Card>
  );
}
