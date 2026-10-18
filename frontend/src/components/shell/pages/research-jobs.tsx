"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Field, Input, Modal, StatusDot, TBody, THead, Table, Td, Th, Tr, useToast } from "@/design-system/react";
import { RiskFlagListView } from "@/components/ui-blocks/risk-flag-list";
import { SourceListView } from "@/components/ui-blocks/source-list";
import { useCaseList } from "@/lib/session/people";
import type { ResearchJobState, ResearchJobSummary, ResearchStatusValue } from "@/lib/research/types";
import { partLabel } from "../nav";

interface JobList {
  mode: "live" | "replay";
  jobs: ResearchJobSummary[];
  /** Set when the service is configured but did not answer; the list then shows the replay job. */
  error?: string;
}

const STATUS: Record<ResearchStatusValue, { tone: "success" | "brand" | "neutral" | "warning" | "danger"; label: string }> = {
  done: { tone: "success", label: "Done" },
  running: { tone: "brand", label: "Running" },
  queued: { tone: "neutral", label: "Queued" },
  needs_disambiguation: { tone: "warning", label: "Which company?" },
  failed: { tone: "danger", label: "Failed" },
};
const pending = (s: ResearchStatusValue) => s === "queued" || s === "running";

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * Research jobs from the research service (list_research_jobs through GET /api/research). Without a service, or when it
 * does not answer, the list holds the replayed Knorr-Bremse run. A row opens the job: progress, then the report.
 */
export function ResearchJobs({ mode }: { mode: "replay" | "live" }) {
  const cases = useCaseList();
  const [list, setList] = useState<JobList | null>(null);
  const [open, setOpen] = useState(false);
  const [openJob, setOpenJob] = useState<ResearchJobSummary | null>(null);

  // Bumping `reload` refetches the list; it also polls while a job is queued or running.
  const [reload, setReload] = useState(0);
  const load = useCallback(() => setReload((n) => n + 1), []);
  useEffect(() => {
    let stop = false;
    fetch("/api/research?limit=50", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<JobList>) : null))
      .then((body) => {
        if (body && !stop) setList(body);
      })
      .catch(() => {
        /* keep the last list */
      });
    return () => {
      stop = true;
    };
  }, [reload]);
  const anyPending = !!list?.jobs.some((j) => pending(j.status));
  useEffect(() => {
    if (!anyPending) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [anyPending, load]);

  /** The case a job belongs to: the case whose shortlist (or linked entities) holds its supplier. */
  const caseOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of cases) for (const id of [...c.shortlist, ...Object.keys(c.linkedEntities)]) if (!m.has(id)) m.set(id, c.id);
    return (supplierId: string | null | undefined) => (supplierId ? (m.get(supplierId) ?? null) : null);
  }, [cases]);

  const jobs = list?.jobs ?? [];
  const shownMode = list?.mode ?? mode;
  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm text-subtext">
          {list ? (
            <>
              <span className="font-mono tabular-nums">{jobs.length}</span> {jobs.length === 1 ? "job" : "jobs"} ·{" "}
              {shownMode === "live" ? "live research service" : mode === "live" ? "research service not answering, showing the recorded run" : "replay of a recorded run"}
            </>
          ) : (
            "Loading research jobs…"
          )}
        </div>
        <Button variant="primary" size="sm" leading={<Plus />} onClick={() => setOpen(true)}>
          New research
        </Button>
      </div>
      {list?.error && <p className="mb-3 text-sm text-subtext">{list.error}</p>}
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="pl-4">Company</Th>
              <Th>Supplier</Th>
              <Th>Case</Th>
              <Th>Status</Th>
              <Th>Mode</Th>
              <Th className="pr-4 text-right">Started</Th>
            </tr>
          </THead>
          <TBody>
            {jobs.map((j) => {
              const caseId = caseOf(j.supplier_id);
              return (
                <Tr key={j.job_id}>
                  <Td className="pl-4 font-medium">
                    <button type="button" onClick={() => setOpenJob(j)} className="text-left text-ink underline-offset-2 hover:underline">
                      {j.company_name}
                    </button>
                    {j.simulated && <span className="ml-2 text-sm font-normal text-tertiary">simulated</span>}
                  </Td>
                  <Td className="font-mono text-sm text-subtext">{j.supplier_id ?? "–"}</Td>
                  <Td>
                    {caseId ? (
                      <Link href={`/cases/${caseId}`} className="text-subtext hover:text-ink hover:underline">
                        {partLabel(caseId.replace(/^case_/, ""))}
                      </Link>
                    ) : (
                      <span className="text-tertiary">–</span>
                    )}
                  </Td>
                  <Td>
                    <StatusDot size="sm" tone={STATUS[j.status]?.tone ?? "neutral"} label={STATUS[j.status]?.label ?? j.status} pulse={pending(j.status)} />
                  </Td>
                  <Td className="text-subtext">{j.mode === "live" ? "Live" : "Replay"}</Td>
                  <Td className="pr-4 text-right font-mono text-sm tabular-nums text-subtext">{dateFmt.format(new Date(j.created_at))}</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </Card>
      <NewResearchDialog
        open={open}
        onClose={() => setOpen(false)}
        mode={mode}
        onStarted={(job) => {
          load();
          setOpenJob(job);
        }}
      />
      <JobReport key={openJob?.job_id ?? "none"} job={openJob} onClose={() => setOpenJob(null)} />
    </>
  );
}

/** One job: live progress while it runs, then the report and its sources (the same blocks as in the chat). Keyed by job id. */
function JobReport({ job, onClose }: { job: ResearchJobSummary | null; onClose: () => void }) {
  const [state, setState] = useState<ResearchJobState | { error: string } | null>(null);
  const jobId = job?.job_id ?? null;
  const company = job?.company_name ?? "";
  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const res = await fetch(`/api/research/${encodeURIComponent(jobId)}?company=${encodeURIComponent(company)}`, { cache: "no-store" });
        const body = (await res.json()) as ResearchJobState | { error: string };
        if (stop) return;
        setState(body);
        if ("status" in body && !body.report && body.status !== "failed") timer = setTimeout(poll, 2500);
      } catch {
        if (!stop) setState({ error: "The research job could not be loaded." });
      }
    };
    void poll();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [jobId, company]);

  return (
    <Modal open={!!job} onClose={onClose} title="Research job" description={jobId ? `Job ${jobId}` : undefined} size="lg" className="max-h-[88vh] max-w-2xl overflow-y-auto">
      {!state ? (
        <p className="text-sm text-subtext">Loading…</p>
      ) : "status" in state ? (
        <div className="flex flex-col gap-3">
          <RiskFlagListView data={state} />
          {state.report && <SourceListView data={state} />}
        </div>
      ) : (
        <p className="text-sm text-ink">{state.error}</p>
      )}
    </Modal>
  );
}

function NewResearchDialog({ open, onClose, mode, onStarted }: { open: boolean; onClose: () => void; mode: "replay" | "live"; onStarted: (job: ResearchJobSummary) => void }) {
  const { toast } = useToast();
  const [company, setCompany] = useState("");
  const [country, setCountry] = useState("");
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = company.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ company_name: name, country: country.trim() || null, website: website.trim() || null, auto_confirm: true }),
      });
      const body = (await res.json()) as { job_id?: string; error?: string; mode?: "live" | "replay" };
      if (!res.ok || !body.job_id) {
        toast({ tone: "danger", title: "Research not started", description: body.error ?? "The research service did not accept the job." });
        return;
      }
      toast({
        tone: "success",
        title: "Research started",
        description: mode === "live" ? `${name} is queued for the research service.` : `Replay mode only has the recorded Knorr-Bremse run; other companies fail.`,
      });
      onStarted({ job_id: body.job_id, company_name: name, status: "queued", created_at: new Date().toISOString(), mode: body.mode ?? mode });
      setCompany("");
      setCountry("");
      setWebsite("");
      onClose();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New research"
      description="Public record check of a real company: news, registers, legal and safety records, patents."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-research" disabled={!company.trim() || busy}>
            Start research
          </Button>
        </>
      }
    >
      <form id="new-research" onSubmit={(e) => void submit(e)} className="flex flex-col gap-3">
        <Field label="Company name" htmlFor="nr-company" required>
          <Input id="nr-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Knorr-Bremse AG" autoFocus />
        </Field>
        <Field label="Country" htmlFor="nr-country" hint="ISO code, optional">
          <Input id="nr-country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="DE" maxLength={2} />
        </Field>
        <Field label="Website" htmlFor="nr-website" hint="Optional; adds the company's own site to the sources">
          <Input id="nr-website" type="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
        </Field>
      </form>
    </Modal>
  );
}
