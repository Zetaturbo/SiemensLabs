"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Card, Field, Input, Modal, StatusDot, TBody, THead, Table, Td, Th, Tr, useToast } from "@/design-system/react";
import { useCaseList } from "@/lib/session/people";
import { partLabel } from "../nav";

interface Job {
  id: string;
  company: string;
  country: string;
  caseId: string | null;
  status: "done" | "running" | "queued";
  mode: "Replay" | "Live";
  started: string;
}

/** The canned research run (src/lib/research/replay.ts), shown as the workspace's completed job. */
const REPLAY_JOB: Job = {
  id: "res_replay_knorr",
  company: "Knorr-Bremse AG",
  country: "DE",
  caseId: "case_brake_system",
  status: "done",
  mode: "Replay",
  started: "2026-10-18T09:12:00Z",
};

const STATUS: Record<Job["status"], { tone: "success" | "brand" | "neutral"; label: string }> = {
  done: { tone: "success", label: "Done" },
  running: { tone: "brand", label: "Running" },
  queued: { tone: "neutral", label: "Queued" },
};

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** Research jobs: the replay job plus any job a case started (linked legal entities with a job id). */
export function ResearchJobs({ mode }: { mode: "replay" | "live" }) {
  const cases = useCaseList();
  const [open, setOpen] = useState(false);
  const jobs = useMemo<Job[]>(() => {
    const fromCases: Job[] = cases.flatMap((c) =>
      Object.values(c.linkedEntities)
        .filter((e) => e.job_id && !/knorr/i.test(e.legal_name))
        .map((e) => ({
          id: e.job_id as string,
          company: e.legal_name,
          country: e.country ?? "–",
          caseId: c.id,
          status: "running" as const,
          mode: mode === "live" ? ("Live" as const) : ("Replay" as const),
          started: c.updatedAt,
        })),
    );
    return [...fromCases, REPLAY_JOB];
  }, [cases, mode]);

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-subtext">
          <span className="font-mono tabular-nums">{jobs.length}</span> {jobs.length === 1 ? "job" : "jobs"} ·{" "}
          {mode === "live" ? "live research agent" : "replay mode"}
        </div>
        <Button variant="primary" size="sm" leading={<Plus />} onClick={() => setOpen(true)}>
          New research
        </Button>
      </div>
      <Card className="overflow-hidden">
        <Table>
          <THead>
            <tr>
              <Th className="pl-4">Company</Th>
              <Th>Country</Th>
              <Th>Case</Th>
              <Th>Status</Th>
              <Th>Mode</Th>
              <Th className="pr-4 text-right">Started</Th>
            </tr>
          </THead>
          <TBody>
            {jobs.map((j) => (
              <Tr key={j.id}>
                <Td className="pl-4 font-medium">{j.company}</Td>
                <Td className="font-mono text-sm text-subtext">{j.country}</Td>
                <Td>
                  {j.caseId ? (
                    <Link href={`/cases/${j.caseId}`} className="text-subtext hover:text-ink hover:underline">
                      {partLabel(j.caseId.replace(/^case_/, ""))}
                    </Link>
                  ) : (
                    <span className="text-tertiary">–</span>
                  )}
                </Td>
                <Td>
                  <StatusDot size="sm" tone={STATUS[j.status].tone} label={STATUS[j.status].label} />
                </Td>
                <Td className="text-subtext">{j.mode}</Td>
                <Td className="pr-4 text-right font-mono text-sm tabular-nums text-subtext">{dateFmt.format(new Date(j.started))}</Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </Card>
      <NewResearchDialog open={open} onClose={() => setOpen(false)} mode={mode} />
    </>
  );
}

function NewResearchDialog({ open, onClose, mode }: { open: boolean; onClose: () => void; mode: "replay" | "live" }) {
  const { toast } = useToast();
  const [company, setCompany] = useState("");
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!company.trim()) return;
    toast({
      tone: "success",
      title: "Research requested",
      description: mode === "live" ? `${company.trim()} is queued for the research agent.` : `Replay mode researches Knorr-Bremse only; ${company.trim()} is noted.`,
    });
    setCompany("");
    onClose();
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New research"
      description="Public record check of a real company: financials, legal, sanctions, ESG."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="new-research" disabled={!company.trim()}>
            Start research
          </Button>
        </>
      }
    >
      <form id="new-research" onSubmit={submit} className="flex flex-col gap-3">
        <Field label="Company name" htmlFor="nr-company" required>
          <Input id="nr-company" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Knorr-Bremse AG" autoFocus />
        </Field>
        <Field label="Country" htmlFor="nr-country" hint="ISO code, optional">
          <Input id="nr-country" placeholder="DE" maxLength={2} />
        </Field>
        <Field label="Website" htmlFor="nr-website" hint="Optional; helps resolve the legal entity">
          <Input id="nr-website" type="url" placeholder="https://" />
        </Field>
      </form>
    </Modal>
  );
}
