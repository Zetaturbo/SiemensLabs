import type { SourcingCase } from "@/lib/cases/types";
import { exclusions } from "@/lib/cases/actions";
import type { FilterCondition } from "@/lib/data-api/types";
import { describeCondition, fieldLabel, fmtEur, fmtNum, isLevel, levelOf, num, type CompareResult, type Level, type Metadata, type Profile, type SupplierRow } from "./domain";

export type CandidateStatus = "awarded" | "finalist" | "shortlisted" | "dropped";

export interface MemoCandidate {
  id: string;
  name: string;
  tri: number | null;
  level: Level | null;
  profileScore: number | null;
  delivery: number | null;
  volume: number | null;
  status: CandidateStatus;
  reason?: string;
}

export interface MemoFactor {
  field: string;
  label: string;
  best: string | null;
  bestValue: number | null;
  worst: string | null;
  worstValue: number | null;
  spread: number | null;
}

export interface MemoModel {
  title: string;
  caseId: string;
  part: string;
  criticality: string | null;
  profile: string;
  profileDescription?: string;
  owner: string;
  date: string;
  stage: string;
  requirements: string[];
  recommendation: (MemoCandidate & { basis: "awarded" | "proposed" }) | null;
  rationale: string[];
  watchPoints: string[];
  candidates: MemoCandidate[];
  factors: MemoFactor[];
  history: Array<{ at: string; who: string; what: string }>;
  research: Array<{ id: string; name: string; entity: string | null; status: string }>;
  limitations: string[];
}

const HISTORY = /^(case created|case reset|stage ->|profile ->|hard requirements|advanced|returned|dropped|linked|unlinked|awarded|award to)/;

export function buildMemo(input: {
  c: SourcingCase;
  meta: Metadata;
  profile: Profile | undefined;
  partLabel: string;
  criticality: string | null;
  candidates: CompareResult | null;
  finalists: CompareResult | null;
}): MemoModel {
  const { c, meta, profile } = input;
  const rows = new Map<string, SupplierRow>((input.candidates?.suppliers ?? []).map((r) => [r.supplier_id, r]));
  for (const r of input.finalists?.suppliers ?? []) if (!rows.has(r.supplier_id)) rows.set(r.supplier_id, r);
  const nameOf = (id: string | null | undefined) => {
    if (!id) return "–";
    const n = rows.get(id)?.supplier_name;
    return typeof n === "string" ? n : id;
  };
  const drops = exclusions(c);
  const lastDrop = new Map(drops.map((d) => [d.supplierId, d]));

  const statusOf = (id: string): CandidateStatus =>
    c.awardedSupplier === id ? "awarded" : c.finalists.includes(id) ? "finalist" : c.shortlist.includes(id) ? "shortlisted" : "dropped";
  const ids = [...new Set([...(c.awardedSupplier ? [c.awardedSupplier] : []), ...c.finalists, ...c.shortlist, ...drops.map((d) => d.supplierId)])];
  const order: Record<CandidateStatus, number> = { awarded: 0, finalist: 1, shortlisted: 2, dropped: 3 };
  const candidates: MemoCandidate[] = ids
    .map((id) => {
      const r = rows.get(id);
      const tri = num(r?.total_risk_index);
      const status = statusOf(id);
      return {
        id,
        name: nameOf(id),
        tri,
        level: isLevel(r?.total_risk_index_level) ? r.total_risk_index_level : levelOf(tri),
        profileScore: num(r?.profile_score),
        delivery: num(r?.delivery_rating),
        volume: num(r?.po_volume_eur),
        status,
        reason: status === "dropped" ? lastDrop.get(id)?.reason : undefined,
      };
    })
    .sort((a, b) => order[a.status] - order[b.status] || (a.profileScore ?? 999) - (b.profileScore ?? 999));

  // recommendation: the award, else the finalist with the best (lowest) profile score
  const finalistCands = candidates.filter((x) => x.status === "finalist" || x.status === "awarded");
  const awarded = candidates.find((x) => x.status === "awarded");
  const proposed = [...finalistCands].sort((a, b) => (a.profileScore ?? 999) - (b.profileScore ?? 999))[0];
  const rec = awarded ? { ...awarded, basis: "awarded" as const } : proposed ? { ...proposed, basis: "proposed" as const } : null;

  const cmp = input.finalists && (input.finalists.suppliers?.length ?? 0) > 1 ? input.finalists : input.candidates;
  const value = (id: string | null | undefined, f: string) => (id ? num(rows.get(id)?.[f]) : null);
  const priority = new Set(cmp?.largest_differences ?? []);
  const factors: MemoFactor[] = (cmp?.per_field ?? [])
    .filter((p) => p.best && p.worst && p.field !== "po_volume_eur")
    .sort((a, b) => Number(priority.has(b.field)) - Number(priority.has(a.field)) || (b.spread ?? 0) - (a.spread ?? 0))
    .slice(0, 6)
    .map((p) => ({ field: p.field, label: fieldLabel(meta, p.field), best: p.best ?? null, bestValue: value(p.best, p.field), worst: p.worst ?? null, worstValue: value(p.worst, p.field), spread: num(p.spread) }));

  const rationale: string[] = [];
  const watchPoints: string[] = [];
  if (rec) {
    const others = finalistCands.filter((x) => x.id !== rec.id);
    if (rec.profileScore !== null && others.length) {
      const next = others.reduce<MemoCandidate | null>((best, x) => (x.profileScore !== null && (best === null || x.profileScore < (best.profileScore ?? 999)) ? x : best), null);
      rationale.push(
        next && next.profileScore !== null
          ? `${profile?.label ?? c.profileId} score ${fmtNum(rec.profileScore, 1)} against ${fmtNum(next.profileScore, 1)} for ${next.name} (lower is better).`
          : `${profile?.label ?? c.profileId} score ${fmtNum(rec.profileScore, 1)} (lower is better).`,
      );
    } else if (rec.profileScore !== null) {
      rationale.push(`${profile?.label ?? c.profileId} score ${fmtNum(rec.profileScore, 1)} (lower is better); no other finalist to compare against.`);
    }
    if (rec.tri !== null) rationale.push(`Total Risk Index ${fmtNum(rec.tri, 0)} (${rec.level ?? "level unknown"}).`);
    const bestIn = (cmp?.per_field ?? []).filter((p) => p.best === rec.id && p.field !== "total_risk_index").map((p) => fieldLabel(meta, p.field));
    if (bestIn.length) rationale.push(`Best in comparison on ${bestIn.slice(0, 6).join(", ")}.`);
    const worstIn = (cmp?.per_field ?? []).filter((p) => p.worst === rec.id).map((p) => fieldLabel(meta, p.field));
    if (worstIn.length) watchPoints.push(`Weakest in comparison on ${worstIn.slice(0, 5).join(", ")}.`);
    const r = rows.get(rec.id);
    const critical = Object.entries(r ?? {})
      .filter(([k, v]) => k.endsWith("_level") && k !== "total_risk_index_level" && v === "Critical")
      .map(([k]) => fieldLabel(meta, k.slice(0, -6)));
    if (critical.length) watchPoints.push(`Critical level on ${critical.join(", ")}; address in negotiation and supplier development.`);
    if (!c.linkedEntities[rec.id]) watchPoints.push("No legal entity linked yet, so public-record research has not run.");
  }

  const research = ids
    .filter((id) => statusOf(id) !== "dropped")
    .map((id) => {
      const e = c.linkedEntities[id];
      return { id, name: nameOf(id), entity: e ? `${e.legal_name}${e.country ? ` (${e.country})` : ""}` : null, status: e ? (e.job_id ? `job ${e.job_id}` : "queued") : "not linked" };
    });

  return {
    title: `Award recommendation: ${input.partLabel}`,
    caseId: c.id,
    part: input.partLabel,
    criticality: input.criticality,
    profile: profile?.label ?? c.profileId,
    profileDescription: profile?.description,
    owner: c.owner ? `${c.owner.name}, ${c.owner.department}` : "unassigned",
    date: new Date().toISOString().slice(0, 10),
    stage: c.stage,
    requirements: c.hardRequirements.map((r) => describeCondition(meta, r as FilterCondition)),
    recommendation: rec,
    rationale,
    watchPoints,
    candidates,
    factors,
    history: c.log.filter((e) => HISTORY.test(e.what)),
    research,
    limitations: [
      "Risk scores come from the supplier risk dataset (0 = no risk, 100 = max); supplier names there are synthetic.",
      "The dataset has no price, category or country data. Commercial terms and quotes are not part of this assessment.",
      "Public-record research applies only to suppliers linked to a legal entity.",
    ],
  };
}

const STATUS_LABEL: Record<CandidateStatus, string> = { awarded: "Awarded", finalist: "Finalist", shortlisted: "Shortlisted", dropped: "Dropped" };

export function memoToMarkdown(m: MemoModel): string {
  const L: string[] = [];
  L.push(`# ${m.title}`, "");
  L.push(`| | |`, `|---|---|`);
  L.push(`| Case | ${m.caseId} |`, `| Part | ${m.part}${m.criticality ? ` (${m.criticality})` : ""} |`, `| Weight profile | ${m.profile} |`, `| Owner | ${m.owner} |`, `| Stage | ${m.stage} |`, `| Date | ${m.date} |`, "");
  L.push("## 1. Recommendation", "");
  if (m.recommendation) {
    const r = m.recommendation;
    L.push(`${r.basis === "awarded" ? "Awarded to" : "Proposed award to"} **${r.name}** (${r.id}).`, "");
    for (const x of m.rationale) L.push(`- ${x}`);
    if (m.watchPoints.length) {
      L.push("", "Watch points:", "");
      for (const x of m.watchPoints) L.push(`- ${x}`);
    }
  } else {
    L.push("No finalist yet. The recommendation follows once suppliers reach the finalist stage.");
  }
  L.push("", "## 2. Requirements", "");
  L.push(m.profileDescription ? `Profile: ${m.profile}. ${m.profileDescription}` : `Profile: ${m.profile}.`, "");
  if (m.requirements.length) for (const r of m.requirements) L.push(`- ${r}`);
  else L.push("- No hard requirements set.");
  L.push("", "## 3. Candidates evaluated", "");
  L.push("| Supplier | ID | Status | TRI | Profile score | Delivery | PO volume |", "|---|---|---|---:|---:|---:|---:|");
  for (const c of m.candidates) {
    L.push(`| ${c.name} | ${c.id} | ${STATUS_LABEL[c.status]} | ${c.tri ?? "–"}${c.level ? ` ${c.level}` : ""} | ${fmtNum(c.profileScore, 1)} | ${c.delivery !== null ? `${fmtNum(c.delivery, 1)}%` : "–"} | ${fmtEur(c.volume)} |`);
  }
  L.push("", "## 4. Deciding factors", "");
  if (m.factors.length) {
    L.push("| Dimension | Best | Worst | Spread |", "|---|---|---|---:|");
    const nm = (id: string | null) => m.candidates.find((c) => c.id === id)?.name ?? id ?? "–";
    for (const f of m.factors) L.push(`| ${f.label} | ${nm(f.best)} (${fmtNum(f.bestValue, 1)}) | ${nm(f.worst)} (${fmtNum(f.worstValue, 1)}) | ${fmtNum(f.spread, 1)} |`);
  } else {
    L.push("Not enough compared suppliers yet.");
  }
  L.push("", "## 5. Exclusions", "");
  const dropped = m.candidates.filter((c) => c.status === "dropped");
  if (dropped.length) for (const d of dropped) L.push(`- **${d.name}** (${d.id}): ${d.reason ?? "no reason recorded"}`);
  else L.push("- No supplier was dropped from the shortlist.");
  L.push("", "## 6. Public-record research", "");
  if (m.research.length) for (const r of m.research) L.push(`- ${r.name}: ${r.entity ? `${r.entity}, research ${r.status}` : "no legal entity linked"}`);
  else L.push("- None.");
  L.push("", "## 7. Process log", "");
  for (const h of m.history) L.push(`- ${h.at.slice(0, 16).replace("T", " ")} · ${h.who} · ${h.what}`);
  L.push("", "## 8. Limitations", "");
  for (const x of m.limitations) L.push(`- ${x}`);
  L.push("");
  return L.join("\n");
}
