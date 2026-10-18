"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowLeft, Award, Building2, FileText, Trash2 } from "lucide-react";
import { Alert, Badge, Button, Card, ConfirmModal, StatusDot, buttonVariants } from "@/design-system/react";
import { award, returnToShortlist, withdrawAward } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { cn } from "@/lib/utils";
import { DropDialog } from "@/components/shortlist/drop-dialog";
import { useCurrentCase, useMetadata, useProfile } from "./case-context";
import { LEVEL_VAR } from "./chart-theme";
import { familiesOf, familyShort, fieldLabel, fmtEur, fmtNum, isLevel, levelOf, num, type CompareResult, type PerField } from "./domain";
import { researchStatus } from "./legal-entity-field";
import { Empty, ErrorNote, LevelChip, MockBadge, Spinner, ui } from "./primitives";
import { CURRENT_USER, useCaseUi } from "./ui-store";

/** Finalists: one column per finalist with summary, linked entity, research status and the award action. */
export function FinalistsView() {
  const c = useCurrentCase();
  const { meta } = useMetadata();
  const profile = useProfile(c?.profileId);
  const openSupplier = useCaseUi((s) => s.openSupplier);
  const [awardId, setAwardId] = useState<string | null>(null);
  const [dropId, setDropId] = useState<string | null>(null);
  const ids = useMemo(() => [...(c?.finalists ?? [])].sort(), [c?.finalists]);
  const compare = useDataTool<CompareResult>("compare_suppliers", ids.length ? { ids, profile_id: c?.profileId ?? "default" } : null);
  const rowById = useMemo(() => new Map((compare.data?.suppliers ?? []).map((r) => [r.supplier_id, r])), [compare.data]);
  const famById = useMemo(() => new Map((compare.data?.family_scores ?? []).map((r) => [r.supplier_id, r])), [compare.data]);
  const perField = useMemo(() => new Map<string, PerField>((compare.data?.per_field ?? []).map((p) => [p.field, p])), [compare.data]);

  if (!c) return null;
  const nameOf = (id: string) => {
    const n = rowById.get(id)?.supplier_name;
    return typeof n === "string" ? n : id;
  };
  const families = familiesOf(meta);
  const deciding = (compare.data?.largest_differences ?? []).slice(0, 3);

  if (!c.finalists.length) {
    return (
      <div className="p-6">
        <Empty>
          No finalists yet. Advance suppliers from the{" "}
          <Link className="text-ink underline underline-offset-2" href={`/cases/${c.id}/shortlist`}>
            shortlist board
          </Link>
          .
        </Empty>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Finalists</h2>
        <span className="text-sm text-subtext">Deeper process: contact, Q&amp;A and negotiation with the last candidates.</span>
        {compare.loading && <Spinner />}
        <MockBadge meta={compare.meta} />
        <div className="ml-auto flex gap-2">
          <Link href={`/cases/${c.id}/shortlist`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
            <ArrowLeft className="size-3.5" /> Shortlist
          </Link>
          <Link href={`/cases/${c.id}/memo`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <FileText className="size-3.5" /> Award memo
          </Link>
        </div>
      </div>

      <ErrorNote error={compare.error} what="compare_suppliers" />

      {c.awardedSupplier && (
        <Alert
          tone="success"
          title={`Awarded to ${nameOf(c.awardedSupplier)}`}
          action={
            <Button size="sm" variant="ghost" onClick={() => withdrawAward(c.id, CURRENT_USER.name)}>
              Withdraw
            </Button>
          }
        >
          The award recommendation memo is ready for review.
        </Alert>
      )}

      {deciding.length > 0 && c.finalists.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <span className={ui.eyebrow}>Deciding factors</span>
          {deciding.map((f) => {
            const p = perField.get(f);
            return (
              <Badge key={f} size="sm" tone="outline" title={p ? `best ${p.best ?? "–"}, worst ${p.worst ?? "–"}, spread ${p.spread}` : undefined}>
                {fieldLabel(meta, f)}
                {p?.best && <span className="font-normal text-tertiary">best {nameOf(p.best)}</span>}
              </Badge>
            );
          })}
        </div>
      )}

      <div className="flex gap-4 overflow-x-auto pb-2">
        {c.finalists.map((id) => {
          const row = rowById.get(id);
          const fam = famById.get(id);
          const entity = c.linkedEntities[id];
          const rs = researchStatus(entity);
          const isAwarded = c.awardedSupplier === id;
          const tri = num(row?.total_risk_index);
          return (
            <Card key={id} variant={isAwarded ? "elevated" : "outline"} className={cn("flex w-72 shrink-0 flex-col", isAwarded && "ring-2 ring-[var(--risk-low)]")}>
              <div className="border-b border-subtle p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <button type="button" className="block max-w-full truncate text-left text-md font-semibold hover:underline" onClick={() => openSupplier(id)}>
                      {nameOf(id)}
                    </button>
                    <div className="font-mono text-2xs text-tertiary">{id}</div>
                  </div>
                  {isAwarded && (
                    <Badge size="sm" tone="success">
                      <Award /> Awarded
                    </Badge>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-2xl font-semibold tabular-nums">{tri ?? "–"}</span>
                  <LevelChip level={row?.total_risk_index_level} score={null} />
                  <span className="ml-auto text-right text-2xs text-subtext">
                    score <span className="font-mono text-xs text-ink">{fmtNum(num(row?.profile_score), 1)}</span>
                    <br />
                    {profile?.label ?? c.profileId}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 border-b border-subtle p-4">
                <div className={ui.eyebrow}>Risk families</div>
                {families.map((f) => {
                  const v = num(fam?.[f]);
                  const l = levelOf(v);
                  return (
                    <div key={f} className="grid grid-cols-[6rem_1fr_2rem] items-center gap-2 text-xs">
                      <span className="truncate text-subtext">{familyShort(f, meta)}</span>
                      <span className="relative h-1.5 overflow-hidden rounded-full bg-sunken">
                        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${v ?? 0}%`, background: l ? LEVEL_VAR[l].fg : undefined }} />
                      </span>
                      <span className="text-right font-mono tabular-nums">{fmtNum(v, 0)}</span>
                    </div>
                  );
                })}
              </div>

              <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-b border-subtle p-4 text-xs">
                {[
                  ["Delivery", `${fmtNum(num(row?.delivery_rating), 1)}%`],
                  ["Confirmation", `${fmtNum(num(row?.order_confirmation_rate), 1)}%`],
                  ["Order changes", `${fmtNum(num(row?.order_change_rate), 1)}%`],
                  ["PO volume", fmtEur(num(row?.po_volume_eur))],
                  ["Sourcing risk", typeof row?.sourcing_risk_level === "string" ? row.sourcing_risk_level : "–"],
                  ["Complexity", typeof row?.supply_chain_complexity === "string" ? row.supply_chain_complexity : "–"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-tertiary">{k}</dt>
                    <dd className="font-mono tabular-nums text-ink">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="space-y-2 border-b border-subtle p-4 text-sm">
                <div className={ui.eyebrow}>Legal entity</div>
                {entity ? (
                  <div className="flex items-start gap-2">
                    <Building2 className="mt-0.5 size-4 text-subtext" />
                    <div className="min-w-0">
                      <div className="truncate font-medium">{entity.legal_name}</div>
                      <div className="text-xs text-subtext">{entity.country ?? "country unknown"}</div>
                    </div>
                  </div>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => openSupplier(id)}>
                    Link legal entity
                  </Button>
                )}
                <StatusDot size="sm" tone={rs.tone} pulse={rs.tone === "warning"} label={entity ? rs.label : "Research not started"} />
                {Object.entries(row ?? {})
                  .filter(([k, v]) => k.endsWith("_level") && k !== "total_risk_index_level" && v === "Critical" && isLevel(v))
                  .slice(0, 4)
                  .map(([k]) => (
                    <span key={k} className="mr-1 inline-block rounded-md px-1.5 py-0.5 text-2xs font-medium" style={{ background: LEVEL_VAR.Critical.bg, color: LEVEL_VAR.Critical.fg }}>
                      {fieldLabel(meta, k.slice(0, -6))}
                    </span>
                  ))}
              </div>

              <div className="mt-auto flex items-center gap-1.5 p-3">
                <Button size="sm" variant={isAwarded ? "subtle" : "primary"} leading={<Award />} disabled={isAwarded} onClick={() => setAwardId(id)} className="flex-1">
                  {isAwarded ? "Awarded" : "Award"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => returnToShortlist(c.id, id, CURRENT_USER.name)} title="Back to the shortlist">
                  <ArrowLeft className="size-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDropId(id)} title="Drop with reason">
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmModal
        open={!!awardId}
        onClose={() => setAwardId(null)}
        onConfirm={() => {
          if (awardId) {
            const r = rowById.get(awardId);
            const lvl = isLevel(r?.total_risk_index_level) ? r.total_risk_index_level : levelOf(num(r?.total_risk_index));
            award(c.id, awardId, CURRENT_USER.name, lvl ?? undefined);
          }
          setAwardId(null);
        }}
        title={awardId ? `Award ${nameOf(awardId)}?` : "Award"}
        description="The case moves to Awarded and the award memo records this decision with the comparison and exclusion reasons."
        confirmLabel="Award supplier"
      />
      <DropDialog caseId={c.id} supplierId={dropId} supplierName={dropId ? nameOf(dropId) : ""} onClose={() => setDropId(null)} />
    </div>
  );
}
