/**
 * `pnpm check:seed`: fails when a seeded case breaks a coherence rule (src/lib/cases/README.md).
 * Runs the app's mock engine on the dataset CSV, so "passes the filters" and "ranks first" mean
 * exactly what filter_suppliers and rank_with_profile compute.
 */
import { PARTS, countMatching, getRows, knockouts, levelFields, passing, rankIds, type Row } from "./seed-engine";
import { OPENING_PROMPTS, SEED_VERSION, SUPPLIER_NAMES, seedCases, seedPresence } from "@/lib/cases/seed";
import { BRAKE_ID_RE, datasetForPart } from "@/lib/data-api/datasets";
import { AVATAR_PALETTE_SIZE, TEAM, memberByName } from "@/lib/cases/team";
import type { SourcingCase, Stage } from "@/lib/cases/types";

const errors: string[] = [];
const fail = (caseId: string, msg: string) => errors.push(`${caseId}: ${msg}`);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const ids = (text: string) => text.match(/SUPP_\d{5}|BRK_\d{4}/g) ?? [];

// The brake case starts the demo from the beginning (not started), so two cases are not started.
const STAGE_MIX: Record<Stage, number> = { awarded: 3, finalists: 3, shortlist: 3, long_list: 2, none: 2 };
const ADVANCED: Stage[] = ["shortlist", "finalists", "awarded"];
const DAY = 86_400_000;

/** Every "<field> <number>" in a finding must be that supplier's value in the dataset. */
function checkFieldValues(caseId: string, text: string, row: Row | undefined) {
  if (!row) return;
  for (const m of text.matchAll(/\b([a-z_]+) (\d+(?:\.\d+)?)\b/g)) {
    if (!(m[1] in row) || typeof row[m[1]] !== "number") continue;
    if (Number(row[m[1]]) !== Number(m[2])) fail(caseId, `"${m[0]}" but ${row.supplier_id} has ${m[1]} ${row[m[1]]}`);
  }
}

/** Log steps in the order a case moves through them; each present step must come after the earlier ones. */
const STEPS: Array<[string, RegExp]> = [
  ["case created", /^case (?:created|opened)$/],
  ["filters set", /^hard requirements: /],
  ["candidates pinned", /^pinned /],
  ["top 3 compared", /^compared top 3: /],
  ["research started", /^research started on /],
  ["research finished", /^research finished on /],
  ["finalists chosen", /^finalists chosen: /],
  ["awarded", /^awarded SUPP_\d{5}: /],
];
const REQUIRED: Record<Stage, string[]> = {
  none: ["case created"],
  long_list: ["case created", "filters set"],
  shortlist: ["case created", "filters set", "candidates pinned"],
  finalists: ["case created", "filters set", "candidates pinned", "top 3 compared", "research started", "research finished", "finalists chosen"],
  awarded: ["case created", "filters set", "candidates pinned", "top 3 compared", "research started", "research finished", "finalists chosen", "awarded"],
};

function checkLog(c: SourcingCase) {
  const now = Date.now();
  let prev = -Infinity;
  for (const e of c.log) {
    const t = Date.parse(e.at);
    if (!(t >= prev)) fail(c.id, `log not ascending at "${e.what}"`);
    if (t > now + 60_000 || t < now - 56 * DAY) fail(c.id, `log entry outside the last eight weeks: "${e.what}"`);
    if (!memberByName(e.who)) fail(c.id, `log author "${e.who}" is not in the team roster`);
    prev = t;
  }
  if (!/^case (?:created|opened)$/.test(c.log[0]?.what ?? "")) fail(c.id, "log must open with case created (or case opened)");
  if (c.updatedAt !== c.log[c.log.length - 1]?.at) fail(c.id, "updatedAt is not the last log entry");
  let lastStep = -1;
  const seen = new Set<string>();
  for (const e of c.log) {
    const i = STEPS.findIndex(([, re]) => re.test(e.what));
    if (i < 0) continue;
    if (i < lastStep) fail(c.id, `"${STEPS[i][0]}" logged after "${STEPS[lastStep][0]}"`);
    lastStep = Math.max(lastStep, i);
    seen.add(STEPS[i][0]);
  }
  for (const step of REQUIRED[c.stage]) if (!seen.has(step)) fail(c.id, `log misses "${step}" for stage ${c.stage}`);
  const entry = (re: RegExp) => c.log.find((e) => re.test(e.what))?.what ?? "";
  if (seen.has("candidates pinned") && !same(ids(entry(/^pinned /)), c.shortlist)) fail(c.id, "pinned log ids differ from the shortlist");
  if (seen.has("top 3 compared") && !same(ids(entry(/^compared top 3: /)), c.finalists)) fail(c.id, "compared ids differ from the finalists");
  if (seen.has("finalists chosen") && !same(ids(entry(/^finalists chosen: /)), c.finalists)) fail(c.id, "finalists log ids differ from the finalists");
}

async function main() {
  // ---------------------------------------------------------------- roster
  if (new Set(TEAM.map((m) => m.id)).size !== TEAM.length || new Set(TEAM.map((m) => m.name)).size !== TEAM.length) errors.push("team: duplicate id or name");
  for (const m of TEAM) {
    if (!Number.isInteger(m.colorIndex) || m.colorIndex < 0 || m.colorIndex >= AVATAR_PALETTE_SIZE) errors.push(`team: ${m.id} colorIndex outside the avatar palette`);
    const initials = m.name.split(/\s+/).map((w) => w[0]).join("").toUpperCase();
    if (m.initials !== initials) errors.push(`team: ${m.id} initials ${m.initials} != ${initials}`);
  }

  // ---------------------------------------------------------------- coverage, stage mix, owners
  for (const p of PARTS) {
    const n = seedCases.filter((c) => c.partId === p.id).length;
    if (n !== 1) errors.push(`${p.id}: ${n} cases (want exactly 1)`);
  }
  for (const c of seedCases) {
    if (!PARTS.some((p) => p.id === c.partId)) fail(c.id, "unknown part");
    if (c.id !== `case_${c.partId}`) fail(c.id, `id should be case_${c.partId}`);
  }
  for (const [stage, want] of Object.entries(STAGE_MIX)) {
    const got = seedCases.filter((c) => c.stage === stage).length;
    if (got !== want) errors.push(`stage mix: ${got} ${stage} (want ${want})`);
  }
  const ownedBy = new Map<string, number>();
  const deptOfGroup = new Map<string, string>();
  for (const c of seedCases) {
    const part = PARTS.find((p) => p.id === c.partId)!;
    const m = c.owner ? memberByName(c.owner.name) : undefined;
    if (!m) {
      fail(c.id, "owner missing or not in the roster");
      continue;
    }
    if (m.department !== c.owner!.department) fail(c.id, `owner department ${c.owner!.department} != roster ${m.department}`);
    ownedBy.set(m.id, (ownedBy.get(m.id) ?? 0) + 1);
    const dept = deptOfGroup.get(part.group);
    if (dept && dept !== m.department) fail(c.id, `group ${part.group} has owners in ${dept} and ${m.department}`);
    deptOfGroup.set(part.group, m.department);
  }
  if (ownedBy.size !== 6) errors.push(`owners: ${ownedBy.size} buyers own cases (want 6)`);
  for (const [id, n] of ownedBy) if (n < 2 || n > 3) errors.push(`owners: ${id} owns ${n} parts (want 2 or 3)`);
  const brakes = seedCases.find((c) => c.partId === "brake_system");
  if (
    !brakes ||
    brakes.stage !== "none" ||
    brakes.shortlist.length ||
    brakes.hardRequirements.length ||
    brakes.profileId !== "safety_critical" ||
    brakes.owner?.name !== "Marcel K." ||
    datasetForPart("brake_system") !== "brakes" ||
    brakes.log.length !== 1 ||
    brakes.log[0].what !== "case opened" ||
    new Date(brakes.log[0].at).toDateString() !== new Date().toDateString()
  )
    errors.push("brake_system: must stay not started (no pins, no filters), safety_critical, brakes dataset, owner Marcel K., log = case opened today");

  // ---------------------------------------------------------------- ids exist, names match
  const allIds = [
    ...new Set([
      ...seedCases.flatMap((c) => [...c.shortlist, ...c.finalists, ...(c.awardedSupplier ? [c.awardedSupplier] : []), ...Object.keys(c.linkedEntities)]),
      ...seedCases.flatMap((c) => [...c.log.flatMap((e) => ids(e.what)), ...(c.notes ?? []).flatMap(ids), ...ids(c.decision?.rationale ?? "")]),
      ...Object.keys(SUPPLIER_NAMES),
    ]),
  ];
  let rows = new Map<string, Row>();
  try {
    rows = new Map((await getRows(allIds)).map((r) => [r.supplier_id, r]));
  } catch (e) {
    errors.push(`ids: ${(e as Error).message}`);
  }
  for (const [id, name] of Object.entries(SUPPLIER_NAMES)) if (rows.get(id)?.supplier_name !== name) errors.push(`SUPPLIER_NAMES: ${id} is "${rows.get(id)?.supplier_name}", not "${name}"`);

  // ---------------------------------------------------------------- per case
  for (const c of seedCases) {
    const part = PARTS.find((p) => p.id === c.partId);
    if (!part) continue;
    if (c.profileId !== part.profile) fail(c.id, `profile ${c.profileId} != part profile ${part.profile}`);
    // A case on the brakes dataset carries the brake filters and pins brake ids; every other case the portfolio's.
    const brakeCase = datasetForPart(c.partId) === "brakes";
    const filters = knockouts(c.profileId);
    for (const id of [...c.shortlist, ...c.finalists]) if (BRAKE_ID_RE.test(id) !== brakeCase) fail(c.id, `${id} is not a ${brakeCase ? "brakes" : "portfolio"} dataset id`);
    if (c.stage === "none") {
      if (c.hardRequirements.length) fail(c.id, "not started but has filters");
    } else if (!same(c.hardRequirements, filters)) fail(c.id, "hardRequirements differ from the profile's knock-outs");

    const advanced = ADVANCED.includes(c.stage);
    if (advanced && (c.shortlist.length < 4 || c.shortlist.length > 7)) fail(c.id, `${c.shortlist.length} pinned (want 4 to 7)`);
    if (!advanced && c.shortlist.length) fail(c.id, `stage ${c.stage} but ${c.shortlist.length} pinned`);
    if (new Set(c.shortlist).size !== c.shortlist.length) fail(c.id, "duplicate pins");
    if (c.shortlist.length) {
      const ok = await passing(c.shortlist, c.hardRequirements);
      for (const id of c.shortlist) if (!ok.includes(id)) fail(c.id, `${id} is pinned but fails the case's filters`);
    }

    const wantFinals = c.stage === "finalists" || c.stage === "awarded" ? 3 : 0;
    if (c.finalists.length !== wantFinals) fail(c.id, `${c.finalists.length} finalists (want ${wantFinals})`);
    for (const id of c.finalists) if (!c.shortlist.includes(id)) fail(c.id, `finalist ${id} is not on the shortlist`);

    const ranked = c.shortlist.length ? await rankIds(c.shortlist, c.profileId) : [];
    const score = new Map(ranked.map((r) => [r.supplier_id, r.profile_score]));
    if (c.stage === "awarded") {
      const w = c.awardedSupplier;
      if (!w || !c.finalists.includes(w)) fail(c.id, `awarded ${w} is not a finalist`);
      else {
        const finalsRanked = await rankIds(c.finalists, c.profileId);
        if (finalsRanked[0]?.supplier_id !== w) fail(c.id, `awarded ${w} but ${finalsRanked[0]?.supplier_id} ranks first among the finalists under ${c.profileId}`);
        if (ranked[0]?.supplier_id !== w) fail(c.id, `awarded ${w} but ${ranked[0]?.supplier_id} ranks first on the shortlist (the memo would recommend it)`);
      }
      const d = c.decision;
      if (!d) fail(c.id, "awarded without a decision");
      else {
        if (d.supplier !== w) fail(c.id, "decision.supplier differs from awardedSupplier");
        const logged = c.log.find((e) => e.what.startsWith(`awarded ${w}`));
        if (!logged || logged.at !== d.at) fail(c.id, "decision.at differs from the awarded log entry");
        if ((d.rationale.match(/[.!?](\s|$)/g) ?? []).length !== 2) fail(c.id, "decision.rationale must be two sentences");
        const m = /\((\d+\.\d+) vs (\d+\.\d+) for (SUPP_\d{5}) and (\d+\.\d+) for (SUPP_\d{5})\)/.exec(d.rationale);
        if (!m || !d.rationale.startsWith(w ?? "")) fail(c.id, "rationale must open with the winner and its profile scores vs the other finalists");
        else
          for (const [sc, id] of [[m[1], w], [m[2], m[3]], [m[4], m[5]]] as Array<[string, string]>)
            if (score.get(id)?.toFixed(2) !== sc) fail(c.id, `rationale gives ${id} ${sc}, rank_with_profile says ${score.get(id)?.toFixed(2)}`);
      }
    } else {
      if (c.awardedSupplier) fail(c.id, `stage ${c.stage} but awarded ${c.awardedSupplier}`);
      if (c.decision) fail(c.id, "decision on a case that is not awarded");
    }
    if (c.stage === "finalists") {
      const top = await rankIds(c.finalists, c.profileId);
      if (top[0]?.supplier_id !== c.finalists[0]) fail(c.id, "finalists are not in profile rank order (chips and Award the best use the first)");
    }

    if (c.notes && c.stage !== "finalists") fail(c.id, "notes are for finalists cases");
    if (c.stage === "finalists" && !c.notes?.length) fail(c.id, "finalists case without buyer notes");
    for (const n of c.notes ?? []) {
      const [id] = ids(n);
      if (!id || !c.finalists.includes(id)) fail(c.id, `note does not name a finalist: "${n}"`);
      if (id) checkFieldValues(c.id, n, rows.get(id));
    }
    for (const e of c.log) {
      const m = /^research finished on (SUPP_\d{5}): (.*)$/.exec(e.what);
      if (m) checkFieldValues(c.id, m[2], rows.get(m[1]));
      if (/^comment: /.test(e.what)) for (const id of ids(e.what)) checkFieldValues(c.id, e.what, rows.get(id));
    }

    // risk summary: the awarded supplier, else the top-ranked pin
    const subject = c.awardedSupplier ?? ranked[0]?.supplier_id;
    const row = subject ? rows.get(subject) : undefined;
    const want = row ? { level: row.total_risk_index_level, flagCount: levelFields(row, "Critical").length } : { level: null, flagCount: 0 };
    if (!same(c.riskSummary, want)) fail(c.id, `riskSummary ${JSON.stringify(c.riskSummary)} != ${JSON.stringify(want)} from ${subject ?? "no supplier"}`);

    const linked = Object.entries(c.linkedEntities);
    // The brake case keeps its Knorr-Bremse link (research replay) although it starts with nothing pinned.
    if (c.partId === "brake_system") {
      if (linked.length !== 1 || linked[0][1].legal_name !== "Knorr-Bremse AG") fail(c.id, "must keep the Knorr-Bremse link");
    } else if (linked.length) fail(c.id, "linked entities only on the brakes case");

    if (c.matching) {
      if (c.matching.filtersKey !== JSON.stringify(c.hardRequirements)) fail(c.id, "matching.filtersKey is not the case's filters");
      const n = await countMatching(c.hardRequirements);
      if (n !== c.matching.count) fail(c.id, `matching ${c.matching.count} but filter_suppliers counts ${n}`);
    } else if (c.stage === "long_list") fail(c.id, "long list without a seeded matching count");

    if (c.finalists.some((id) => !SUPPLIER_NAMES[id])) fail(c.id, "SUPPLIER_NAMES lacks a finalist");
    checkLog(c);
  }

  // ---------------------------------------------------------------- presence
  const presence = seedPresence();
  for (const m of TEAM) if (!presence[m.id]) errors.push(`presence: ${m.id} has no presence`);
  for (const [pid, p] of Object.entries(presence)) {
    if (!TEAM.some((m) => m.id === pid)) errors.push(`presence: ${pid} is not in the roster`);
    if (p.caseId && !seedCases.some((c) => c.id === p.caseId)) errors.push(`presence: ${pid} is in unknown case ${p.caseId}`);
    if (Number.isNaN(Date.parse(p.lastSeen))) errors.push(`presence: ${pid} lastSeen is not a date`);
  }
  for (const c of seedCases) {
    const here = Object.entries(presence).filter(([, p]) => p.caseId === c.id).map(([pid]) => TEAM.find((m) => m.id === pid)?.name);
    if (here.length && (!here.includes(c.owner?.name ?? "") || here.length > 3)) fail(c.id, `presence ${here.join(", ")}: want the owner plus zero to two others`);
  }

  for (const [caseId, prompts] of Object.entries(OPENING_PROMPTS)) {
    if (!seedCases.some((c) => c.id === caseId)) errors.push(`OPENING_PROMPTS: unknown case ${caseId}`);
    if (prompts.length !== 3) errors.push(`OPENING_PROMPTS: ${caseId} has ${prompts.length} prompts (want 3)`);
  }

  console.log(`seed v${SEED_VERSION}: ${seedCases.length} cases, ${allIds.length} supplier ids, ${TEAM.length} team members`);
  for (const s of Object.keys(STAGE_MIX) as Stage[])
    console.log(`  ${s.padEnd(9)} ${seedCases.filter((c) => c.stage === s).map((c) => `${c.partId} (${c.owner?.name}, ${c.shortlist.length}/${c.finalists.length}${c.awardedSupplier ? ` -> ${c.awardedSupplier}` : ""})`).join(", ")}`);
  if (errors.length) {
    console.error(`\ncheck:seed FAILED (${errors.length})`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log("check:seed OK");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
