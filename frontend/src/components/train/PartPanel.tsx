"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, Flag, Plus, ShieldAlert, UserPlus, X } from "lucide-react";
import { Badge, Button, buttonVariants, Card, cn, IconButton, Tooltip } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { CRITICALITY_LABEL, GROUP_LABEL, PROFILE_LABEL } from "./config";
import { ME, RISK_CSS, STAGE_LABEL, STAGES, type PartView } from "./encoding";
import { STAGE_CSS } from "./palette";
import { usePartViewMap, usePartViews, useTrainUi } from "./store";

/** The case store has no owner action yet; assign locally until it does. */
function pickUp(caseId: string) {
  useCases.setState((s) => {
    const c = s.cases[caseId];
    if (!c) return s;
    const at = new Date().toISOString();
    return { cases: { ...s.cases, [caseId]: { ...c, owner: ME, log: [...c.log, { at, who: ME.name, what: "picked up the case" }], updatedAt: at } } };
  });
}

const flags = (n: number) => `${n} red flag${n === 1 ? "" : "s"}`;

export function StageDot({ stage, className }: { stage: PartView["stage"]; className?: string }) {
  return <span aria-hidden className={cn("inline-block size-2 shrink-0 rounded-full ring-1 ring-strong", className)} style={{ background: STAGE_CSS[stage] }} />;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-subtle py-2 last:border-0">
      <dt className="text-sm text-subtext">{label}</dt>
      <dd className="text-right text-sm text-ink">{children}</dd>
    </div>
  );
}

function StageRail({ stage }: { stage: PartView["stage"] }) {
  const at = STAGES.indexOf(stage);
  return (
    <ol className="grid grid-cols-4 gap-1" aria-label={`Stage: ${STAGE_LABEL[stage]}`}>
      {STAGES.slice(1).map((s, i) => {
        const reached = at >= i + 1;
        return (
          <li key={s} className="min-w-0">
            <span className={cn("block h-1 rounded-full", !reached && "bg-sunken")} style={reached ? { background: STAGE_CSS[stage] } : undefined} />
            <span className={cn("mt-1 block truncate text-2xs", at === i + 1 ? "font-medium text-ink" : "text-tertiary")}>{STAGE_LABEL[s]}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RiskBadge({ view }: { view: PartView }) {
  if (!view.risk) return <span className="text-subtext">Not assessed</span>;
  const c = RISK_CSS[view.risk];
  return (
    <Badge size="sm" dot style={{ color: c.fg, background: c.bg }}>
      {view.risk}
    </Badge>
  );
}

function ReuseHint({ view }: { view: PartView }) {
  const views = usePartViews();
  const donors = views.filter((v) => v.part.id !== view.part.id && v.part.group === view.part.group && v.case?.awardedSupplier);
  if (!donors.length) return null;
  return (
    <Card padding="sm" className="mt-4 bg-sunken">
      <p className="text-2xs font-medium tracking-[0.06em] text-tertiary uppercase">Reuse in {GROUP_LABEL[view.part.group] ?? view.part.group}</p>
      <ul className="mt-2 space-y-2.5">
        {donors.map((d) => (
          <li key={d.part.id} className="flex items-center justify-between gap-3">
            <span className="min-w-0">
              <span className="block text-sm text-ink">
                Awarded by {d.owner?.department ?? "another team"}: <span className="tabular font-mono">{d.case!.awardedSupplier}</span>
              </span>
              <span className="block text-xs text-subtext">{d.part.label}</span>
            </span>
            <Tooltip label="Coming soon" side="left">
              <Button size="sm" variant="secondary" leading={<Plus />} disabled>
                Add as candidate
              </Button>
            </Tooltip>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function Actions({ view }: { view: PartView }) {
  const router = useRouter();
  const createCase = useCases((s) => s.createCase);
  const c = view.case;
  if (!c) {
    return (
      <Button
        variant="primary"
        block
        leading={<UserPlus />}
        onClick={() => {
          const created = createCase(view.part.id, view.part.profile, ME);
          router.push(`/cases/${created.id}`);
        }}
      >
        Create case and assign to me
      </Button>
    );
  }
  return (
    <div className="flex gap-2">
      {!c.owner && (
        <Button variant="primary" className="flex-1" leading={<UserPlus />} onClick={() => pickUp(c.id)}>
          Pick up
        </Button>
      )}
      <Link href={`/cases/${c.id}`} className={cn(buttonVariants({ variant: c.owner ? "primary" : "secondary" }), "flex-1")}>
        Open case <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}

function Overview() {
  const views = usePartViews();
  const select = useTrainUi((s) => s.select);
  const counts = STAGES.map((s) => ({ stage: s, n: views.filter((v) => v.stage === s).length }));
  const attention = views
    .filter((v) => v.flagCount > 0 || v.needsCase)
    .sort((a, b) => b.flagCount - a.flagCount || Number(b.needsCase) - Number(a.needsCase));
  return (
    <div className="p-4">
      <h2 className="text-md font-semibold text-ink">Velaro-class high-speed train</h2>
      <p className="mt-1 text-sm text-subtext">{views.length} parts, one sourcing case each. Select a part on the train or below.</p>
      <ul className="mt-4 grid grid-cols-5 gap-1.5">
        {counts.map(({ stage, n }) => (
          <li key={stage}>
            <Card padding="none" className="px-1.5 py-2 text-center">
              <span className="tabular block font-mono text-lg leading-none text-ink">{n}</span>
              <span className="mt-1.5 flex items-center justify-center gap-1 truncate text-2xs text-subtext">
                <StageDot stage={stage} className="size-1.5" />
                {STAGE_LABEL[stage]}
              </span>
            </Card>
          </li>
        ))}
      </ul>
      {attention.length > 0 && (
        <>
          <h3 className="mt-5 text-2xs font-medium tracking-[0.06em] text-tertiary uppercase">Needs attention</h3>
          <ul className="mt-1.5 -mx-2">
            {attention.map((v) => (
              <li key={v.part.id}>
                <button
                  type="button"
                  onClick={() => select(v.part.id, { fly: true })}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-left text-sm text-ink hover:bg-hover"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <StageDot stage={v.stage} />
                    <span className="truncate">{v.part.label}</span>
                  </span>
                  {v.flagCount ? (
                    <Badge size="sm" tone="danger" className="shrink-0">
                      <Flag /> {flags(v.flagCount)}
                    </Badge>
                  ) : (
                    <Badge size="sm" tone="warning" className="shrink-0">
                      <ShieldAlert /> No case
                    </Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function PartPanel() {
  const selectedId = useTrainUi((s) => s.selectedId);
  const select = useTrainUi((s) => s.select);
  const views = usePartViewMap();
  const view = selectedId ? views[selectedId] : undefined;
  if (!view) return <Overview />;
  const { part, case: c } = view;

  return (
    <div className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-2xs font-medium tracking-[0.06em] text-tertiary uppercase">{GROUP_LABEL[part.group] ?? part.group}</p>
          <h2 className="mt-0.5 text-xl font-semibold tracking-[-0.02em] text-ink">{part.label}</h2>
        </div>
        <Tooltip label="Close (Esc)" side="left">
          <IconButton aria-label="Close part" size="sm" onClick={() => select(null)}>
            <X />
          </IconButton>
        </Tooltip>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge size="sm" tone="outline">
          {PROFILE_LABEL[view.profileId] ?? view.profileId}
        </Badge>
        <Badge size="sm" tone={part.criticality === "safety" ? "warning" : "neutral"}>
          {part.criticality === "safety" && <ShieldAlert />}
          Criticality: {CRITICALITY_LABEL[part.criticality]}
        </Badge>
      </div>

      <div className="mt-4">
        <StageRail stage={view.stage} />
      </div>

      <dl className="mt-3">
        <Row label="Stage">
          <span className="inline-flex items-center gap-1.5">
            <StageDot stage={view.stage} />
            {STAGE_LABEL[view.stage]}
          </span>
        </Row>
        <Row label="Owner">{view.owner ? `${view.owner.name} · ${view.owner.department}` : c ? "Unassigned" : "No case yet"}</Row>
        <Row label="Shortlist">
          <span className="tabular font-mono">{c?.shortlist.length ?? 0}</span>
        </Row>
        <Row label="Finalists">
          <span className="tabular font-mono">{c?.finalists.length ?? 0}</span>
        </Row>
        <Row label="Awarded supplier">{c?.awardedSupplier ? <span className="tabular font-mono">{c.awardedSupplier}</span> : <span className="text-subtext">None</span>}</Row>
        <Row label="Risk">
          <span className="inline-flex items-center gap-1.5">
            <RiskBadge view={view} />
            {view.flagCount > 0 && (
              <Badge size="sm" tone="danger">
                <Flag /> {flags(view.flagCount)}
              </Badge>
            )}
          </span>
        </Row>
      </dl>

      {view.needsCase && <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-sm text-ink">Safety-relevant part without a sourcing case.</p>}

      <div className="mt-4">
        <Actions view={view} />
      </div>

      <ReuseHint view={view} />
    </div>
  );
}
