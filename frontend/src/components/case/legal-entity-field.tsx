"use client";
import { useState } from "react";
import { Building2, Link2, Search } from "lucide-react";
import { Badge, Button, Field, Input, StatusDot } from "@/design-system/react";
import { linkEntity, unlinkEntity, type LinkedEntity } from "@/lib/cases/actions";
import { cn } from "@/lib/utils";
import { CURRENT_USER } from "./ui-store";

const LEGAL_FORM = /\b(gmbh|ag|se|kg|s\.?a\.?|s\.?p\.?a\.?|ltd|limited|inc|corp|b\.?v\.?|plc|oy|ab)\.?$/i;

/** Placeholder entity search until the research agent resolves entities (needs_disambiguation step). */
function mockCandidates(name: string, country: string): LinkedEntity[] {
  const base = name.trim().replace(/\s+/g, " ");
  if (!base) return [];
  const cc = country.trim().toUpperCase() || undefined;
  if (LEGAL_FORM.test(base)) {
    return [{ legal_name: base, country: cc }, { legal_name: `${base.replace(LEGAL_FORM, "").trim()} Holding`, country: cc }];
  }
  return [
    { legal_name: `${base} GmbH`, country: cc ?? "DE" },
    { legal_name: `${base} AG`, country: cc ?? "DE" },
    { legal_name: `${base} S.A.`, country: cc && cc !== "DE" ? cc : "FR" },
  ];
}

export function researchStatus(entity: LinkedEntity | undefined): { tone: "neutral" | "warning" | "success"; label: string } {
  if (!entity) return { tone: "neutral", label: "No legal entity linked" };
  if (entity.job_id) return { tone: "warning", label: `Research job ${entity.job_id} running` };
  return { tone: "warning", label: "Research will start (queued for the research agent)" };
}

/**
 * Links the synthetic dataset supplier to a real company (legal entity). Stores the link on the case
 * via linkEntity and logs it; starting research_company is the research agent's job.
 */
export function LegalEntityField({ caseId, supplierId, entity }: { caseId: string; supplierId: string; entity: LinkedEntity | undefined }) {
  const [editing, setEditing] = useState(!entity);
  const [name, setName] = useState(entity?.legal_name ?? "");
  const [country, setCountry] = useState(entity?.country ?? "");
  const [candidates, setCandidates] = useState<LinkedEntity[] | null>(null);

  if (entity && !editing) {
    const st = researchStatus(entity);
    return (
      <div className="space-y-2">
        <div className="flex items-start gap-2.5 rounded-lg bg-sunken p-2.5">
          <Building2 className="mt-0.5 size-4 text-subtext" />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-ink">{entity.legal_name}</div>
            <div className="text-xs text-subtext">
              {entity.country ?? "country unknown"}
              {entity.website ? ` · ${entity.website}` : ""}
            </div>
          </div>
          <Badge size="sm" tone="outline">
            linked
          </Badge>
        </div>
        <StatusDot tone={st.tone} pulse={st.tone === "warning"} label={st.label} />
        <div className="flex gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
            Change
          </Button>
          <Button size="sm" variant="ghost" onClick={() => unlinkEntity(caseId, supplierId, CURRENT_USER.name)}>
            Unlink
          </Button>
        </div>
      </div>
    );
  }

  const link = (e: LinkedEntity) => {
    linkEntity(caseId, supplierId, e, CURRENT_USER.name);
    setEditing(false);
    setCandidates(null);
  };

  return (
    <div className="space-y-2.5">
      <p className="text-xs text-subtext">Dataset names are synthetic. Link the real company behind this supplier so the research agent can check public records.</p>
      <form
        className="grid grid-cols-[1fr_5rem] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setCandidates(mockCandidates(name, country));
        }}
      >
        <Field label={<span className="text-sm">Legal entity</span>} htmlFor={`le-${supplierId}`}>
          <Input id={`le-${supplierId}`} inputSize="sm" placeholder="e.g. Example Rail Components GmbH" value={name} onChange={(e) => setName(e.target.value)} leading={<Search />} />
        </Field>
        <Field label={<span className="text-sm">Country</span>} htmlFor={`lc-${supplierId}`}>
          <Input id={`lc-${supplierId}`} inputSize="sm" placeholder="DE" maxLength={2} value={country} onChange={(e) => setCountry(e.target.value)} className="uppercase" />
        </Field>
        <div className="col-span-2 flex gap-1.5">
          <Button size="sm" type="submit" disabled={!name.trim()} leading={<Search />}>
            Find candidates
          </Button>
          <Button size="sm" variant="ghost" disabled={!name.trim()} onClick={() => link({ legal_name: name.trim(), country: country.trim().toUpperCase() || undefined })} leading={<Link2 />}>
            Link as typed
          </Button>
          {entity && (
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          )}
        </div>
      </form>
      {candidates && (
        <div className="rounded-lg border border-subtle">
          <div className="flex items-center justify-between border-b border-subtle px-2.5 py-1.5">
            <span className="text-xs font-medium text-ink">Candidates</span>
            <Badge size="sm" tone="outline" title="Entity resolution lands with the research agent">
              mock
            </Badge>
          </div>
          {candidates.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-subtext">Type a company name first.</p>
          ) : (
            <ul>
              {candidates.map((cand, i) => (
                <li key={i} className={cn("flex items-center gap-2 px-2.5 py-1.5", i > 0 && "border-t border-subtle")}>
                  <Building2 className="size-3.5 text-tertiary" />
                  <span className="flex-1 text-sm">{cand.legal_name}</span>
                  <span className="font-mono text-2xs text-tertiary">{cand.country ?? "–"}</span>
                  <Button size="sm" variant="secondary" className="h-7" onClick={() => link(cand)}>
                    Link
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
