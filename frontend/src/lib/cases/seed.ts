import { FALLBACK_KNOCKOUTS } from "@/components/case/domain";
import type { FilterCondition } from "@/lib/data-api/types";
import { ownerOf } from "./team";
import type { Presence, SourcingCase, Stage } from "./types";

/**
 * Seeded sourcing cases: one per train part, at a coherent stage. The brake system runs on the brakes dataset
 * (train-parts.json "dataset": "brakes"; 60 simulated suppliers BRK_0001..BRK_0060), every other part on the portfolio.
 * Portfolio ids were chosen with `pnpm tsx scripts/pick-seed.ts`; all are checked by `pnpm check:seed`
 * (filters = the profile's knock-outs, or BRAKE_CASE_FILTERS on the brakes case; pinned ids pass them,
 * shortlist in profile rank order, finalists = its top 3, awarded = the first finalist). Bump SEED_VERSION on any change (README.md).
 */
export const SEED_VERSION = 4;

/**
 * Opening chips per case, where the stage chips do not fit. The brake case starts the RFQ-02 demo from the beginning
 * (data/brakes/demo/rfq02_demo_script.md); the case screen's chip builder (components/case/case-guide.ts) reads it.
 */
export const OPENING_PROMPTS: Record<string, string[]> = {
  case_brake_system: [
    "We need 30,000 rail brake pads a year for a regional train. Which suppliers offer rail brake pads?",
    "What matters for brakes?",
    "Which filters apply to a safety-critical part?",
  ],
};

const DAY = 86_400_000;
const NOW = Math.floor(Date.now() / 60_000) * 60_000;
/** ISO time `days` ago, to the minute; the trail spans the last eight weeks. */
const ago = (days: number) => new Date(NOW - Math.round((days * DAY) / 60_000) * 60_000).toISOString();

/** Names of the finalists (and the brakes case's linked supplier) for the opening message and chips; from the dataset. */
export const SUPPLIER_NAMES: Record<string, string> = {
  SUPP_00609: "Dynamic Partners 444",
  SUPP_00808: "Advanced Logistics 455",
  SUPP_01420: "Elite Industries 865",
  SUPP_01535: "Global Partners 234",
  SUPP_01979: "Global Partners 965",
  SUPP_02367: "Advanced Systems 987",
  SUPP_02434: "Dynamic Partners 908",
  SUPP_02605: "Dynamic Logistics 536",
  SUPP_03267: "Advanced Industries 539",
  SUPP_04007: "Elite Systems 169",
  SUPP_04088: "Advanced Manufacturing 907",
  SUPP_04741: "Apex Partners 935",
  SUPP_04963: "Dynamic Group 590",
  SUPP_05506: "Prime Group 383",
  SUPP_06257: "Prime Manufacturing 269",
  SUPP_06655: "Advanced Technologies 195",
  SUPP_07787: "Precision Group 949",
  SUPP_09027: "Strategic Technologies 607",
  SUPP_09794: "Global Industries 127",
};

/** [days ago, what, author (team id; default the case owner)] */
type Event = [daysAgo: number, what: string, who?: string];

const ev = {
  created: (d: number, who?: string): Event => [d, "case created", who],
  filters: (d: number, profileId: string): Event => [d, `hard requirements: ${FALLBACK_KNOCKOUTS[profileId].length} rules (preset from ${profileId} knock-outs)`],
  pinned: (d: number, ids: string[], who?: string): Event => [d, `pinned ${ids.join(", ")}`, who],
  compared: (d: number, ids: string[], profileId: string): Event => [d, `compared top 3: ${ids.join(", ")} (${profileId} profile)`],
  researchRequested: (d: number, ids: string[]): Event => [d, `research requested on ${ids.join(", ")}`],
  /** Research is run by the supplier risk analyst. */
  researchStarted: (d: number, ids: string[]): Event => [d, `research started on ${ids.join(", ")}`, "david"],
  researchDone: (d: number, id: string, finding: string): Event => [d, `research finished on ${id}: ${finding}`, "david"],
  finalists: (d: number, ids: string[]): Event => [d, `finalists chosen: ${ids.join(", ")}`],
  awarded: (d: number, id: string, reason: string): Event => [d, `awarded ${id}: ${reason}`],
  /** Four-eyes sign-off by the category manager. */
  approved: (d: number, id: string): Event => [d, `approved award to ${id} (four-eyes)`, "sophie"],
  comment: (d: number, who: string, text: string): Event => [d, `comment: ${text}`, who],
};

interface Spec {
  partId: string;
  stage: Stage;
  /** Team id of the owning buyer. */
  owner: string;
  profileId: string;
  shortlist?: string[];
  /** Finalists and awarded stages: the first 3 of the shortlist. */
  finals?: boolean;
  award?: { days: number; rationale: string };
  notes?: string[];
  matching?: number;
  /** Filters other than the profile's knock-outs. */
  filters?: FilterCondition[];
  linkedEntities?: SourcingCase["linkedEntities"];
  risk?: SourcingCase["riskSummary"];
  events: Event[];
}

function seed(s: Spec): SourcingCase {
  const hardRequirements = s.events.some(([, w]) => w.startsWith("hard requirements")) ? (s.filters ?? FALLBACK_KNOCKOUTS[s.profileId]).map((c) => ({ ...c })) : [];
  const shortlist = s.shortlist ?? [];
  const finalists = s.finals ? shortlist.slice(0, 3) : [];
  const awardedSupplier = s.award ? finalists[0] : null;
  const owner = ownerOf(s.owner);
  const log = s.events.map(([d, what, who]) => ({ at: ago(d), who: who ? ownerOf(who).name : owner.name, what }));
  return {
    id: `case_${s.partId}`,
    partId: s.partId,
    stage: s.stage,
    owner,
    profileId: s.profileId,
    hardRequirements,
    shortlist,
    finalists,
    awardedSupplier,
    linkedEntities: s.linkedEntities ?? {},
    riskSummary: s.risk ?? { level: null, flagCount: 0 },
    log,
    updatedAt: log[log.length - 1].at,
    ...(s.award && awardedSupplier ? { decision: { supplier: awardedSupplier, rationale: s.award.rationale, at: ago(s.award.days) } } : {}),
    ...(s.notes ? { notes: s.notes } : {}),
    ...(s.matching !== undefined ? { matching: { count: s.matching, filtersKey: JSON.stringify(hardRequirements) } } : {}),
  };
}

const LOW = { level: "Low", flagCount: 0 } as const;

// ------------------------------------------------------------------ awarded (3)

const couplers = ["SUPP_04963", "SUPP_06655", "SUPP_04088", "SUPP_05562", "SUPP_06771", "SUPP_04080"];
const pantograph = ["SUPP_09794", "SUPP_06257", "SUPP_09027", "SUPP_02670", "SUPP_02675"];
const hvac = ["SUPP_01535", "SUPP_02605", "SUPP_04007", "SUPP_08780", "SUPP_06526", "SUPP_05654", "SUPP_04129"];

// ------------------------------------------------------------------ finalists (3)

const bogies = ["SUPP_07787", "SUPP_01420", "SUPP_05506", "SUPP_09220", "SUPP_04061"];
const motors = ["SUPP_00808", "SUPP_04741", "SUPP_02434", "SUPP_06266", "SUPP_01703", "SUPP_08305"];
const control = ["SUPP_00609", "SUPP_01979", "SUPP_02367", "SUPP_00672", "SUPP_01026", "SUPP_08356", "SUPP_04985"];

// ------------------------------------------------------------------ shortlist (4)

const doors = ["SUPP_03469", "SUPP_09475", "SUPP_09463", "SUPP_07967"];
const carBody = ["SUPP_06161", "SUPP_02389", "SUPP_06998", "SUPP_04722", "SUPP_00180"];
const converter = ["SUPP_07260", "SUPP_00347", "SUPP_04817", "SUPP_07279"];

const top3 = (ids: string[]) => ids.slice(0, 3);

/** Seeded states so the train map and every case screen show coherent work. The brake system is the live case. */
export const seedCases: SourcingCase[] = [
  seed({
    partId: "couplers",
    stage: "awarded",
    owner: "jonas",
    profileId: "safety_critical",
    shortlist: couplers,
    finals: true,
    risk: LOW,
    award: {
      days: 36.1,
      rationale:
        "SUPP_04963 has the lowest safety-critical profile score of the three finalists (3.75 vs 4.15 for SUPP_06655 and 4.75 for SUPP_04088), leading on safety_incident 0. " +
        "It avoids the High geopolitical_risk of SUPP_06655 (52; SUPP_04963 36).",
    },
    events: [
      ev.created(55.2),
      ev.filters(55.1, "safety_critical"),
      ev.pinned(50.3, couplers),
      ev.compared(47.4, top3(couplers), "safety_critical"),
      ev.researchRequested(46.4, top3(couplers)),
      ev.researchStarted(46.2, top3(couplers)),
      ev.researchDone(44.9, "SUPP_04963", "no Critical scores, 2 High (environmental_exposure 61, political_stability 67)"),
      ev.researchDone(44.8, "SUPP_06655", "no Critical scores, 3 High (environmental_exposure 60, geopolitical_risk 52, political_stability 52)"),
      ev.researchDone(44.7, "SUPP_04088", "no Critical scores, 1 High (political_stability 51)"),
      ev.finalists(41.3, top3(couplers)),
      ev.comment(38.0, "sophie", "geopolitical_risk 52 on SUPP_06655 noted; fine to decide on the profile score"),
      ev.awarded(36.1, "SUPP_04963", "lowest safety-critical profile score of the three finalists (3.75)."),
      ev.approved(35.8, "SUPP_04963"),
    ],
  }),
  seed({
    partId: "pantograph",
    stage: "awarded",
    owner: "lena",
    profileId: "strategic_system",
    shortlist: pantograph,
    finals: true,
    risk: LOW,
    award: {
      days: 29.6,
      rationale:
        "SUPP_09794 has the lowest strategic-system profile score of the three finalists (11.79 vs 12.64 for SUPP_06257 and 13.15 for SUPP_09027), leading on quality_risk 0 and compliance_risk 0. " +
        "No finalist carries a High or Critical score, so the profile score decides.",
    },
    events: [
      ev.created(53.6),
      ev.filters(53.5, "strategic_system"),
      ev.pinned(48.7, pantograph, "priya"),
      ev.compared(45.2, top3(pantograph), "strategic_system"),
      ev.researchRequested(44.1, top3(pantograph)),
      ev.researchStarted(43.9, top3(pantograph)),
      ev.researchDone(42.1, "SUPP_09794", "no High or Critical scores; weakest profile dimension geopolitical_risk 31 (Medium)"),
      ev.researchDone(42.0, "SUPP_06257", "no High or Critical scores; weakest profile dimension operational_resilience 22 (Low)"),
      ev.researchDone(41.9, "SUPP_09027", "no High or Critical scores; weakest profile dimension sub_tier_visibility 30 (Medium)"),
      ev.finalists(38.4, top3(pantograph)),
      ev.awarded(29.6, "SUPP_09794", "lowest strategic-system profile score of the three finalists (11.79)."),
      ev.approved(29.2, "SUPP_09794"),
    ],
  }),
  seed({
    partId: "hvac",
    stage: "awarded",
    owner: "tom",
    profileId: "commodity",
    shortlist: hvac,
    finals: true,
    risk: LOW,
    award: {
      days: 21.4,
      rationale:
        "SUPP_01535 has the lowest commodity profile score of the three finalists (6.90 vs 7.13 for SUPP_02605 and 8.12 for SUPP_04007), leading on compliance_risk 7 and order change rate 3.2 %. " +
        "It still carries High industry_benchmark 51, political_stability 59, credit_rating 55, which the commodity profile weights at 5 % or less, so they stay open as award conditions.",
    },
    events: [
      ev.created(49.3),
      ev.filters(49.2, "commodity"),
      ev.pinned(44.1, hvac),
      ev.compared(40.5, top3(hvac), "commodity"),
      ev.researchRequested(39.4, top3(hvac)),
      ev.researchStarted(39.2, top3(hvac)),
      ev.researchDone(37.8, "SUPP_01535", "no Critical scores, 3 High (industry_benchmark 51, political_stability 59, credit_rating 55)"),
      ev.researchDone(37.7, "SUPP_02605", "no High or Critical scores; weakest profile dimension financial_health 32 (Medium)"),
      ev.researchDone(37.6, "SUPP_04007", "no Critical scores, 1 High (political_stability 54)"),
      ev.finalists(33.7, top3(hvac)),
      ev.comment(22.9, "sophie", "keep credit_rating 55 of SUPP_01535 as an award condition"),
      ev.awarded(21.4, "SUPP_01535", "lowest commodity profile score of the three finalists (6.90)."),
      ev.approved(21.1, "SUPP_01535"),
    ],
  }),
  seed({
    partId: "train_control",
    stage: "finalists",
    owner: "aisha",
    profileId: "strategic_system",
    shortlist: control,
    finals: true,
    risk: LOW,
    notes: [
      "research on SUPP_00609 found no High or Critical scores; weakest profile dimension political_stability 42",
      "research on SUPP_01979 found no High or Critical scores; weakest profile dimension safety_incident 42",
      "research on SUPP_02367 found three High scores: safety_incident 57, environmental_exposure 54, esg_performance 59",
    ],
    events: [
      ev.created(41.4),
      ev.filters(41.3, "strategic_system"),
      ev.pinned(34.2, control),
      ev.compared(27.5, top3(control), "strategic_system"),
      ev.researchRequested(25.3, top3(control)),
      ev.researchStarted(25.1, top3(control)),
      ev.researchDone(22.6, "SUPP_00609", "no High or Critical scores; weakest profile dimension political_stability 42 (Medium)"),
      ev.researchDone(22.5, "SUPP_01979", "no High or Critical scores; weakest profile dimension safety_incident 42 (Medium)"),
      ev.researchDone(22.4, "SUPP_02367", "no Critical scores, 3 High (safety_incident 57, environmental_exposure 54, esg_performance 59)"),
      ev.finalists(19.8, top3(control)),
      ev.comment(2.3, "sophie", "SUPP_02367 needs an explanation for safety_incident 57 before award"),
    ],
  }),
  seed({
    partId: "bogie_wheelsets",
    stage: "finalists",
    owner: "marcel",
    profileId: "safety_critical",
    shortlist: bogies,
    finals: true,
    risk: LOW,
    notes: [
      "research on SUPP_07787 found no High or Critical scores; weakest profile dimension financial_health 26",
      "research on SUPP_01420 found one High score: geopolitical_risk 60",
      "research on SUPP_05506 found five High scores, the highest geopolitical_risk 72",
    ],
    events: [
      ev.created(37.2),
      ev.filters(37.1, "safety_critical"),
      ev.pinned(30.4, bogies),
      ev.compared(17.6, top3(bogies), "safety_critical"),
      ev.researchRequested(15.5, top3(bogies)),
      ev.researchStarted(15.3, top3(bogies)),
      ev.researchDone(13.2, "SUPP_07787", "no High or Critical scores; weakest profile dimension financial_health 26 (Medium)"),
      ev.researchDone(13.1, "SUPP_01420", "no Critical scores, 1 High (geopolitical_risk 60)"),
      ev.researchDone(13.0, "SUPP_05506", "no Critical scores, 5 High (industry_benchmark 59, media_sentiment 64, environmental_exposure 60, geopolitical_risk 72, political_stability 57)"),
      ev.comment(12.8, "david", "SUPP_05506 has five High external scores, geopolitical_risk 72 the highest"),
      ev.finalists(9.3, top3(bogies)),
    ],
  }),
  seed({
    partId: "traction_motors",
    stage: "finalists",
    owner: "lena",
    profileId: "strategic_system",
    shortlist: motors,
    finals: true,
    risk: LOW,
    notes: [
      "research on SUPP_00808 found one High score: political_stability 51",
      "research on SUPP_04741 found one High score: geopolitical_risk 64",
      "research on SUPP_02434 still running",
    ],
    events: [
      ev.created(33.5),
      ev.filters(33.4, "strategic_system"),
      ev.pinned(24.8, motors),
      ev.compared(11.6, top3(motors), "strategic_system"),
      ev.researchRequested(8.6, top3(motors)),
      ev.researchStarted(8.4, top3(motors)),
      ev.researchDone(6.2, "SUPP_00808", "no Critical scores, 1 High (political_stability 51)"),
      ev.researchDone(6.1, "SUPP_04741", "no Critical scores, 1 High (geopolitical_risk 64)"),
      ev.finalists(5.7, top3(motors)),
    ],
  }),
  seed({
    partId: "car_body",
    stage: "shortlist",
    owner: "jonas",
    profileId: "strategic_system",
    shortlist: carBody,
    risk: LOW,
    events: [
      ev.created(26.4, "sophie"),
      ev.filters(26.3, "strategic_system"),
      ev.pinned(18.2, carBody),
      ev.comment(1.1, "sophie", "compare the top 3 under the strategic-system profile next"),
    ],
  }),
  seed({
    partId: "traction_converter",
    stage: "shortlist",
    owner: "priya",
    profileId: "strategic_system",
    shortlist: converter,
    risk: LOW,
    events: [ev.created(21.7, "sophie"), ev.filters(21.6, "strategic_system"), ev.pinned(12.9, converter, "lena")],
  }),
  seed({
    partId: "doors",
    stage: "shortlist",
    owner: "tom",
    profileId: "safety_critical",
    shortlist: doors,
    risk: LOW,
    events: [ev.created(16.3), ev.filters(16.2, "safety_critical"), ev.pinned(8.1, doors)],
  }),
  // The live demo case: not started, on the brakes dataset (train-parts.json), so the RFQ-02 conversation creates
  // its filters and pins itself. The Knorr-Bremse link stays for the research replay.
  seed({
    partId: "brake_system",
    stage: "none",
    owner: "marcel",
    profileId: "safety_critical",
    risk: { level: null, flagCount: 0 },
    linkedEntities: { SUPP_03267: { legal_name: "Knorr-Bremse AG", country: "DE", website: "https://www.knorr-bremse.com" } },
    events: [[0, "case opened"]],
  }),
  seed({
    partId: "interiors",
    stage: "long_list",
    owner: "tom",
    profileId: "lksg_due_diligence",
    matching: 7594,
    events: [ev.created(6.6, "sophie"), ev.filters(6.5, "lksg_due_diligence")],
  }),
  seed({
    partId: "battery_aux",
    stage: "long_list",
    owner: "priya",
    profileId: "lksg_due_diligence",
    matching: 7594,
    events: [ev.created(4.3, "sophie"), ev.filters(4.2, "lksg_due_diligence")],
  }),
  seed({
    partId: "cab_hmi",
    stage: "none",
    owner: "aisha",
    profileId: "strategic_system",
    events: [ev.created(1.4, "sophie")],
  }),
];

/**
 * Who is in which case right now (team id -> presence), deterministic: owners in one of their open cases,
 * the category manager reviewing the brakes with the owner, the risk analyst on the brakes research;
 * Priya offline. The store drifts it on the client (store.ts, startPresenceDrift).
 */
export function seedPresence(): Record<string, Presence> {
  const at = (minutesAgo: number) => new Date(NOW - minutesAgo * 60_000).toISOString();
  return {
    marcel: { caseId: "case_brake_system", lastSeen: at(0) },
    sophie: { caseId: "case_brake_system", lastSeen: at(1) },
    david: { caseId: "case_brake_system", lastSeen: at(3) },
    tom: { caseId: "case_doors", lastSeen: at(2) },
    aisha: { caseId: "case_train_control", lastSeen: at(0) },
    lena: { caseId: "case_traction_motors", lastSeen: at(4) },
    jonas: { caseId: "case_car_body", lastSeen: at(6) },
    priya: { caseId: null, lastSeen: at(155) },
  };
}
