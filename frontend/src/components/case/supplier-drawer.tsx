"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, FileSearch, Plus, X } from "lucide-react";
import { Badge, Button, Card, CardHeader, IconButton, SegmentedControl, Skeleton, StatusDot, Tabs } from "@/design-system/react";
import { advanceToFinalists, exclusions, pinToShortlist } from "@/lib/cases/actions";
import { useDataTool } from "@/lib/hooks/use-data-tool";
import { useCaseId, useCurrentCase, useMetadata, useProfile } from "./case-context";
import { LEVEL_VAR } from "./chart-theme";
import { ContributionWaterfall } from "./contribution-waterfall";
import { familiesOf, fieldLabel, fmtEur, fmtNum, levelOf, num, scoreFields, str, type CompareResult, type ExplainResult, type Metadata } from "./domain";
import { FamilyRadar } from "./family-radar";
import { LegalEntityField, researchStatus } from "./legal-entity-field";
import { ErrorNote, LevelChip, MockBadge, Stat, ui } from "./primitives";
import { CURRENT_USER, useCaseUi, type DrawerTab } from "./ui-store";

type Explain = ExplainResult & { profile_score?: number; supplier_name?: string; context?: Record<string, unknown> };

/** Dataset-mean family scores from the per-field dataset means in explain_supplier (default profile). */
function datasetFamilyMeans(meta: Metadata, explain: Explain | null): Record<string, number> {
  const out: Record<string, number> = {};
  if (!explain?.contributions) return out;
  const means = new Map(explain.contributions.map((c) => [c.field, num((c as { dataset_mean?: number }).dataset_mean)]));
  for (const fam of familiesOf(meta)) {
    let s = 0;
    let w = 0;
    for (const f of scoreFields(meta).filter((x) => x.family === fam)) {
      const m = means.get(f.field);
      if (m === null || m === undefined) continue;
      const wt = f.official_weight ?? 1;
      s += wt * m;
      w += wt;
    }
    if (w) out[fam] = s / w;
  }
  return out;
}

function PercentileBars({ meta, explain }: { meta: Metadata; explain: Explain | null }) {
  const rows = (explain?.contributions ?? [])
    .filter((c) => typeof c.percentile === "number")
    .sort((a, b) => (b.percentile ?? 0) - (a.percentile ?? 0));
  if (!rows.length) return <p className="text-sm text-subtext">No percentiles in this response.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((c) => {
        const l = c.level ?? levelOf(num(c.value));
        const color = l ? LEVEL_VAR[l].fg : "var(--lw-gray-400)";
        return (
          <li key={c.field} className="grid grid-cols-[9.5rem_1fr_3rem] items-center gap-2 text-xs" title={`${fieldLabel(meta, c.field)}: value ${fmtNum(num(c.value), 0)}, riskier than ${fmtNum(num(c.percentile), 1)}% of suppliers`}>
            <span className="truncate text-ink">{fieldLabel(meta, c.field)}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-sunken">
              <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(2, c.percentile ?? 0)}%`, background: color }} />
              <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-line" />
            </span>
            <span className="text-right font-mono tabular-nums text-subtext">p{fmtNum(num(c.percentile), 0)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function DrawerBody({ supplierId, tab, setTab }: { supplierId: string; tab: DrawerTab; setTab: (t: DrawerTab) => void }) {
  const caseId = useCaseId();
  const c = useCurrentCase();
  const { meta } = useMetadata();
  const profile = useProfile(c?.profileId);
  const [weights, setWeights] = useState<"default" | "profile">("default");
  const profileId = c?.profileId ?? "default";
  const explainDefault = useDataTool<Explain>("explain_supplier", { id: supplierId, profile_id: "default" });
  const explainProfile = useDataTool<Explain>("explain_supplier", weights === "profile" && profileId !== "default" ? { id: supplierId, profile_id: profileId } : null);
  const compare = useDataTool<CompareResult>("compare_suppliers", { ids: [supplierId], profile_id: profileId });
  const ex = explainDefault.data;
  const exActive = weights === "profile" && profileId !== "default" ? explainProfile.data : ex;
  const row = compare.data?.suppliers?.find((s) => s.supplier_id === supplierId) ?? null;
  const fam = compare.data?.family_scores?.find((s) => s.supplier_id === supplierId) ?? null;
  const families = familiesOf(meta);
  const datasetMeans = useMemo(() => datasetFamilyMeans(meta, ex), [meta, ex]);

  const name = str(row?.supplier_name) ?? str(ex?.supplier_name) ?? supplierId;
  const tri = num(ex?.total_risk_index) ?? num(row?.total_risk_index);
  const triLevel = ex?.total_risk_level ?? row?.total_risk_index_level;
  const ops = { ...(ex?.operational_metrics ?? {}), ...(ex?.context ?? {}) } as Record<string, unknown>;
  const metric = (k: string) => row?.[k] ?? ops[k];
  const onShortlist = !!c?.shortlist.includes(supplierId);
  const isFinalist = !!c?.finalists.includes(supplierId);
  const isAwarded = c?.awardedSupplier === supplierId;
  const dropped = c ? exclusions(c).filter((e) => e.supplierId === supplierId).pop() : undefined;
  const entity = c?.linkedEntities[supplierId];
  const loading = explainDefault.loading && !ex;

  return (
    <>
      <div className="border-b border-subtle px-5 pb-0 pt-4">
        <div className="flex items-start gap-3 pr-8">
          <div className="min-w-0 flex-1">
            {loading ? <Skeleton className="h-7 w-48" /> : <h2 className="truncate text-xl font-semibold tracking-[-0.01em]">{name}</h2>}
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-subtext">
              <span className="font-mono">{supplierId}</span>
              {isAwarded && (
                <Badge size="sm" tone="success">
                  Awarded
                </Badge>
              )}
              {isFinalist && !isAwarded && <Badge size="sm">Finalist</Badge>}
              {onShortlist && !isFinalist && <Badge size="sm">Shortlisted</Badge>}
              {dropped && !onShortlist && (
                <Badge size="sm" tone="outline" title={dropped.reason}>
                  Dropped
                </Badge>
              )}
              <MockBadge meta={explainDefault.meta} />
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center justify-end gap-2">
              <span className="font-mono text-3xl font-semibold tabular-nums tracking-[-0.02em]">{tri ?? "–"}</span>
              <LevelChip level={triLevel} size="md" />
            </div>
            <div className="text-2xs text-subtext">
              Total Risk Index{typeof ex?.percentile === "number" ? <> · riskier than <span className="font-mono">{fmtNum(ex.percentile, 1)}%</span></> : null}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {!onShortlist && (
            <Button size="sm" variant="primary" leading={<Plus />} disabled={!c || c.shortlist.length >= 20} onClick={() => pinToShortlist(caseId, supplierId, CURRENT_USER.name)}>
              Add to shortlist
            </Button>
          )}
          {onShortlist && !isFinalist && (
            <Button size="sm" variant="primary" trailing={<ArrowRight />} onClick={() => advanceToFinalists(caseId, supplierId, CURRENT_USER.name)}>
              Advance to finalists
            </Button>
          )}
          {dropped && (
            <span className="text-xs text-subtext">
              Dropped by {dropped.who}: {dropped.reason}
            </span>
          )}
        </div>
        <Tabs
          variant="underline"
          className="mt-3"
          value={tab}
          onValueChange={setTab}
          items={[
            { value: "risk", label: "Risk profile" },
            { value: "public_record", label: "Public record", badge: entity ? <StatusDot size="sm" tone="warning" /> : undefined },
          ]}
        />
      </div>

      <div className="flex-1 space-y-4 overflow-auto bg-sunken/50 p-5">
        <ErrorNote error={explainDefault.error} what="explain_supplier" />
        <ErrorNote error={compare.error} what="compare_suppliers" />
        {tab === "risk" ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Delivery" value={`${fmtNum(num(metric("delivery_rating")), 1)}%`} hint="higher is better" />
              <Stat label="Confirmation" value={`${fmtNum(num(metric("order_confirmation_rate")), 1)}%`} hint="higher is better" />
              <Stat label="Order changes" value={`${fmtNum(num(metric("order_change_rate")), 1)}%`} hint="higher is worse" />
              <Stat label="PO volume" value={fmtEur(num(metric("po_volume_eur")))} hint="exposure" />
              <Stat label="Sourcing risk" value={str(metric("sourcing_risk_level")) ?? "–"} />
              <Stat label="Complexity" value={str(metric("supply_chain_complexity")) ?? "–"} />
              <Stat label="Profile score" value={fmtNum(num(row?.profile_score) ?? num(exActive?.profile_score), 1)} hint={`${profile?.label ?? profileId}, lower is better`} />
              <Stat label="Critical fields" value={ex?.critical_fields?.length ?? "–"} />
            </div>

            <Card>
              <CardHeader title="Risk families" description="Family scores against the dataset mean (0 = no risk, 100 = max)." />
              <div className="px-4 pb-4">
                {fam ? (
                  <FamilyRadar
                    meta={meta}
                    families={families}
                    series={[
                      ...(Object.keys(datasetMeans).length ? [{ id: "dataset_mean", name: "Dataset mean", scores: datasetMeans, reference: true }] : []),
                      { id: supplierId, name, scores: fam },
                    ]}
                  />
                ) : compare.loading ? (
                  <Skeleton className="h-48" />
                ) : (
                  <p className="text-sm text-subtext">No family scores in this response.</p>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Why this score"
                description="Each bar is weight x (value - dataset mean). Positive bars raise risk."
                action={
                  profileId !== "default" ? (
                    <SegmentedControl
                      size="sm"
                      value={weights}
                      onValueChange={setWeights}
                      items={[
                        { value: "default", label: "TRI weights" },
                        { value: "profile", label: "Profile" },
                      ]}
                    />
                  ) : undefined
                }
              />
              <div className="px-4 pb-4">
                {exActive ? (
                  <ContributionWaterfall meta={meta} explain={exActive} endLabel={weights === "profile" ? "Profile score" : "Total Risk Index"} />
                ) : (
                  <Skeleton className="h-64" />
                )}
                {!!ex?.critical_fields?.length && (
                  <div className="mt-3 flex flex-wrap items-center gap-1">
                    <span className={`${ui.eyebrow} mr-1`}>Critical</span>
                    {ex.critical_fields.map((f) => (
                      <span key={f} className="rounded-md px-1.5 py-0.5 text-2xs font-medium" style={{ background: LEVEL_VAR.Critical.bg, color: LEVEL_VAR.Critical.fg }}>
                        {fieldLabel(meta, f)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader title="Percentiles" description="Share of suppliers with a lower value, per risk score." />
              <div className="px-4 pb-4">{ex ? <PercentileBars meta={meta} explain={ex} /> : <Skeleton className="h-40" />}</div>
            </Card>

            <Card>
              <CardHeader title="Legal entity" description="The real company behind this supplier, for web research." />
              <div className="px-4 pb-4">
                <LegalEntityField key={`${supplierId}:${entity?.legal_name ?? ""}`} caseId={caseId} supplierId={supplierId} entity={entity} />
              </div>
            </Card>
          </>
        ) : (
          <Card>
            <CardHeader title="Public record" description="Findings from the research agent with source links: financial, legal, sanctions, quality, ESG." />
            <div className="space-y-3 px-4 pb-4 text-sm">
              {entity ? (
                <>
                  <div className="rounded-lg bg-sunken p-2.5">
                    <div className="font-medium">{entity.legal_name}</div>
                    <div className="text-xs text-subtext">{entity.country ?? "country unknown"}</div>
                  </div>
                  <StatusDot tone="warning" pulse label={researchStatus(entity).label} />
                  <p className="text-subtext">The report (summary, risk flags with sources, category assessment) appears here once the research agent is connected.</p>
                </>
              ) : (
                <div className="flex flex-col items-center gap-2 py-6 text-center text-subtext">
                  <FileSearch className="size-6 text-tertiary" />
                  <p>Link a legal entity on the Risk profile tab to start research.</p>
                  <Button size="sm" onClick={() => setTab("risk")}>
                    Link legal entity
                  </Button>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
    </>
  );
}

/** Supplier detail as a right-hand drawer; opens from any row via useCaseUi.openSupplier(id). */
export function SupplierDrawer() {
  const supplierId = useCaseUi((s) => s.selectedSupplier);
  const tab = useCaseUi((s) => s.drawerTab);
  const setTab = useCaseUi((s) => s.setDrawerTab);
  const close = useCaseUi((s) => s.closeSupplier);

  useEffect(() => {
    if (!supplierId) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [supplierId, close]);

  if (!supplierId || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Supplier details">
      <div className="absolute inset-0 bg-overlay animate-[lw-fade-in_140ms_var(--lw-ease-out)]" onClick={close} />
      <div className="absolute inset-y-0 right-0 flex w-full max-w-[640px] flex-col border-l border-subtle bg-surface shadow-lg">
        <IconButton aria-label="Close" size="sm" className="absolute right-3 top-3 z-10" onClick={close}>
          <X />
        </IconButton>
        <DrawerBody key={supplierId} supplierId={supplierId} tab={tab} setTab={setTab} />
      </div>
    </div>,
    document.body,
  );
}
