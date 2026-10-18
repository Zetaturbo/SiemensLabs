"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { ArrowRight, Flag, ShieldAlert, X } from "lucide-react";
import { Badge, Button, buttonVariants, Card, cn, IconButton, Tooltip } from "@/design-system/react";
import { useCases } from "@/lib/cases/store";
import { CRITICALITY_LABEL, GROUP_LABEL, PROFILE_LABEL } from "./config";
import { ME, RISK_CSS, STAGE_LABEL, STAGES, stageText, type PartView } from "./encoding";
import { STAGE_CSS } from "./palette";
import { ActivityFeed } from "./ActivityFeed";
import { usePartViewMap, usePartViews, useTrainUi } from "./store";

const flags = (n: number) => `${n} red flag${n === 1 ? "" : "s"}`;

function StageDot({ stage, className }: { stage: PartView["stage"]; className?: string }) {
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
          <li key={d.part.id}>
            <span className="block text-sm text-ink">
              Awarded by {d.owner?.department ?? "another team"}: <span className="tabular font-mono">{d.case!.awardedSupplier}</span>
            </span>
            <span className="block text-xs text-subtext">{d.part.label}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** One clear way into the procurement: open the part's case, or start one. Closing the panel (x, Esc) eases the view back. */
function Actions({ view }: { view: PartView }) {
  const router = useRouter();
  const createCase = useCases((s) => s.createCase);
  const c = view.case;
  return (
    <div className="flex gap-2">
      {c ? (
        <Link href={`/cases/${c.id}`} className={cn(buttonVariants({ variant: "primary" }), "flex-1")}>
          {c.stage === "none" ? "Start sourcing" : "Open case"} <ArrowRight className="size-4" />
        </Link>
      ) : (
        <Button
          variant="primary"
          className="flex-1"
          trailing={<ArrowRight />}
          onClick={() => {
            const created = createCase(view.part.id, view.part.profile, ME);
            router.push(`/cases/${created.id}`);
          }}
        >
          Start sourcing
        </Button>
      )}
    </div>
  );
}

export function PartPanel() {
  const selectedId = useTrainUi((s) => s.selectedId);
  const select = useTrainUi((s) => s.select);
  const views = usePartViewMap();
  const view = selectedId ? views[selectedId] : undefined;
  if (!view) return null;
  const { part, case: c } = view;

  return (
    <div className="px-4 pb-4">
      <div className="sticky top-0 z-10 -mx-4 flex items-start justify-between gap-3 bg-surface px-4 pt-4 pb-2">
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
      {part.description && <p className="text-sm text-subtext">{part.description}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Badge size="sm" tone="outline">
          {PROFILE_LABEL[view.profileId] ?? view.profileId}
        </Badge>
        <Badge size="sm" tone={part.criticality === "safety" ? "warning" : "neutral"}>
          {part.criticality === "safety" && <ShieldAlert />}
          Criticality: {CRITICALITY_LABEL[part.criticality]}
        </Badge>
      </div>

      <div className="mt-4">
        <Actions view={view} />
      </div>

      <div className="mt-5">
        <StageRail stage={view.stage} />
      </div>

      <dl className="mt-3">
        <Row label="Stage">
          <span className="inline-flex items-center gap-1.5">
            <StageDot stage={view.stage} />
            {stageText(view)}
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


      <ReuseHint view={view} />

      <ActivityFeed partId={part.id} />
    </div>
  );
}
