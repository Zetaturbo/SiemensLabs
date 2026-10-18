/**
 * Deterministic graders for data/eval/supplier_risk_eval_v1.jsonl, one per evaluation.method.
 * No LLM judge: every check is a containment or tolerance test on the answer text, so a run can be
 * re-graded offline (pnpm eval:answers --regrade).
 *
 *   exact_match     expected.value appears as a number (and expected.level as a word, when given)
 *   exact_match_id  expected.answer_id is named as the winner (see winnerNamed)
 *   numeric         some number in the answer is within evaluation.tolerance (abs or rel) of expected.value
 *   set_match       supplier ids in the answer vs expected.ids / ids_ordered; pass at F1 >= 0.8
 *   refusal         the answer says the information is not available
 *   rubric          key-point containment: each key point is reduced to what can be checked in text
 *                   (supplier ids, numbers, levels, field names, above/below, refusal and direction phrases);
 *                   pass when every checkable key point holds. Key points with nothing checkable
 *                   ("Does not fabricate a value") are recorded as null and left out.
 *
 * Strict mode (the brakes sets, `grade(item, text, { strict: { prose, allowed } })`); the portfolio grading is unchanged:
 *   set_match       ids named in the prose only (tool summaries list every candidate); pass only on the exact set,
 *                   precision and recall reported; `expected.values` (certifications) checked against the cert vocabulary
 *   refusal         says it is not available AND the prose holds no invented number (every number must appear in the
 *                   question, the context or a tool result of the conversation; integers up to 12 and 100 are allowed)
 *   rubric          key points with nothing checkable are matched by normalised phrase containment (approximate: true)
 *   exact_match     Yes / No as whole words in the prose; certification codes (ISO 14001) are not numbers
 */

export interface EvalItem {
  id: string;
  category: string;
  difficulty: string;
  question: string;
  ground_truth_answer: string;
  expected: Record<string, unknown>;
  evaluation: { method: string; key_points?: string[]; tolerance?: { abs?: number; rel?: number } };
  supplier_ids?: string[];
  fields?: string[];
}

export interface KeyPointResult {
  key_point: string;
  pass: boolean | null;
  why: string;
}

export interface Grade {
  method: string;
  /** rubric in strict mode: some key points were matched by phrase containment only */
  approximate?: boolean;
  /** null = nothing checkable (counted as ungraded) */
  pass: boolean | null;
  score: number | null;
  detail: string;
  key_points?: KeyPointResult[];
}

const LEVELS = ["Low", "Medium", "High", "Critical"];

export const idsIn = (text: string): string[] => [
  ...new Set([
    ...[...text.matchAll(/\bSUPP[_-]?(\d{1,5})\b/gi)].map((m) => `SUPP_${m[1].padStart(5, "0")}`),
    ...[...text.matchAll(/\bBRK[_-]?(\d{1,4})\b/gi)].map((m) => `BRK_${m[1].padStart(4, "0")}`),
  ]),
];

/** Numbers in the text, with k / M / bn suffixes applied as extra candidates. Supplier ids are removed first. */
export function numbersIn(text: string): number[] {
  const clean = text
    .replace(/\bSUPP[_-]?\d{1,5}\b/gi, " ")
    .replace(/\bBRK[_-]?\d{1,4}\b/gi, " ")
    .replace(/\b(?:Q[1-4]|20\d\d-\d\d-\d\d)\b/g, " ");
  const out: number[] = [];
  const re = /(-?\d{1,3}(?:,\d{3})+(?:\.\d+)?|-?\d+(?:\.\d+)?)(?:\s?(k|K|M|m|mn|million|bn|B|billion)\b)?/g;
  for (const m of clean.matchAll(re)) {
    const v = Number(m[1].replace(/,/g, ""));
    if (!Number.isFinite(v)) continue;
    out.push(v);
    const s = m[2];
    if (s) out.push(v * (/^k$/i.test(s) ? 1e3 : /^(M|m|mn|million)$/.test(s) ? 1e6 : 1e9));
  }
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[_\-/]+/g, " ")
    .replace(/\bscores?\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const near = (a: number, b: number, abs: number, rel = 0) => Math.abs(a - b) <= Math.max(abs, rel * Math.abs(b)) + 1e-9;

const hasNumber = (text: string, v: number, abs = 0.051, rel = 0.005) => numbersIn(text).some((n) => near(n, v, abs, rel));
const hasLevel = (text: string, level: string) => new RegExp(`\\b${level}\\b`, "i").test(text);
const hasField = (text: string, field: string) => norm(text).includes(norm(field));

export const REFUSAL_RE =
  /not (?:available|in (?:the|our|this) [\w /-]{0,40}?(?:data|dataset|records|database)|included|tracked|recorded|captured|part of|something|contained|covered)|(?:no|n't|not have|lacks?) (?:any )?(?:data|information|field|column|record)|(?:can ?not|can't|unable to|not able to|no way to) (?:predict|forecast|determine|tell|provide|answer|know|say|confirm|see)|does(?: not|n't) (?:contain|include|have|exist|cover|track|hold)|isn't (?:available|in|part)|outside (?:the|our) (?:data|dataset)|not found|does not exist|doesn't exist|no supplier/i;
const DIRECTION_RE =
  /higher [\w -]{0,40}?(?:mean|means|indicate|indicates|=|signal|signals|reflect|reflects)[^.]{0,20}(?:higher|more|greater|worse) risk|(?:^|[.:]\s*|\*\*)worse\b|higher (?:is|=|means) worse|0 ?(?:=|means|is) ?(?:no|lowest|minimal) risk|100 ?(?:=|means|is) ?(?:max|maximum|highest)|(?:lower|low) (?:is|=|means) better|higher is worse|risk score/i;
const AGGREGATE_RE = /aggregat|outweigh|\d+ of (?:the |its )?\d+ (?:risk )?(?:categories|scores|dimensions)|weighted (?:average|sum|mean|combination)|combin|composite|across (?:the )?(?:\d+|eighteen|multiple|several|all) (?:risk )?(?:categories|dimensions|scores)|roll(?:s|ed)? up/i;
const ABOVE_RE = /\babove\b|higher than|greater than|more than|exceeds/i;
const BELOW_RE = /\bbelow\b|lower than|less than|under\b|beneath/i;
const WINNER_RE = /lowest|highest|best|safest|safer|winner|recommend|stronger|least risk|most risk|riskiest|better|wins|top/i;

/** A number within 80 characters after a mention of the field (words joined by space, _ or -; "Score" optional; TRI for the index). */
function fieldNumber(text: string, field: string, v: number): boolean {
  const words = norm(field).replace(/\b(?:eur|euro|usd)\b/g, " ").split(" ").filter(Boolean);
  if (!words.length || /^(?:value|it|the value)$/.test(words.join(" "))) return hasNumber(text, v);
  const alias = words.join(" ") === "total risk index" ? "|\\bTRI\\b" : "";
  const re = new RegExp(`${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\s_-]+")}(?:[\\s_-]+scores?)?${alias}`, "gi");
  for (const m of text.matchAll(re)) {
    const window = text.slice(m.index! + m[0].length, m.index! + m[0].length + 80);
    if (hasNumber(window, v)) return true;
  }
  return false;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };

/** Checks one rubric key point. */
export function checkKeyPoint(kp: string, text: string): KeyPointResult {
  const k = kp.trim();
  const lower = k.toLowerCase();
  if (/does not (?:invent|fabricate|guess|make up)|doesn't (?:invent|fabricate)|without (?:inventing|guessing)/.test(lower))
    return { key_point: k, pass: null, why: "not checkable in text" };
  if (/not available|cannot predict|can't predict|not in the dataset|unavailable|cannot be (?:determined|answered)|says it cannot|states? (?:that )?(?:it|the data) (?:is|are) (?:not|missing)/.test(lower))
    return { key_point: k, pass: REFUSAL_RE.test(text), why: "refusal phrase" };
  if (/higher scores? mean|higher (?:values?|numbers?) mean|higher is worse|score direction/.test(lower)) return { key_point: k, pass: DIRECTION_RE.test(text), why: "direction phrase" };
  if (/aggregat|combines|composite/.test(lower)) return { key_point: k, pass: AGGREGATE_RE.test(text), why: "aggregation phrase" };

  // "States Total Risk Index 81 (Critical)": the number must follow a mention of the field.
  const stated = k.match(/^(?:states|reports|gives|mentions)\s+(?:the\s+)?([A-Za-z][A-Za-z \-]+?)\s+(?:of\s+|is\s+|=\s*)?(-?\d[\d,]*(?:\.\d+)?)%?\s*(?:\((Low|Medium|High|Critical)\))?\s*$/i);
  if (stated) {
    const [, field, num, level] = stated;
    const v = Number(num.replace(/,/g, ""));
    const ok = fieldNumber(text, field, v) && (!level || hasLevel(text, level));
    return { key_point: k, pass: ok, why: ok ? `${field} ${v} found` : `${field} ${v}${level ? ` (${level})` : ""} not stated` };
  }

  // "at least N of: a, b, c" / "at least two operational KPIs correctly (x, y, z)"
  const atLeast = lower.match(/at least (\d|one|two|three|four|five)\b/);
  const listPart = k.includes(":") ? k.slice(k.indexOf(":") + 1) : atLeast ? (k.match(/\(([^)]*)\)\s*$/)?.[1] ?? "") : "";
  const items = listPart
    .split(/,|;|\band\b/)
    .map((s) => s.trim())
    .filter(Boolean);
  const itemOk = (item: string) => {
    const ids = idsIn(item);
    const nums = numbersIn(item.replace(/\bSUPP[_-]?\d+\b/gi, " "));
    if (ids.length || nums.length) return ids.every((id) => text.includes(id)) && nums.every((n) => hasNumber(text, n));
    return hasField(text, item.replace(/\(.*?\)/g, ""));
  };
  if (atLeast && items.length) {
    const need = /\d/.test(atLeast[1]) ? Number(atLeast[1]) : WORD_NUM[atLeast[1]];
    const got = items.filter(itemOk).length;
    return { key_point: k, pass: got >= need, why: `${got}/${items.length} listed items found, need ${need}` };
  }
  if (items.length && !/\d/.test(listPart) && !idsIn(listPart).length) {
    const got = items.filter(itemOk).length;
    const levelHere = LEVELS.filter((l) => new RegExp(`\\b${l}\\b`).test(k.slice(0, k.indexOf(":") >= 0 ? k.indexOf(":") : k.length)));
    const levelsOk = levelHere.every((l) => hasLevel(text, l));
    return { key_point: k, pass: got === items.length && levelsOk, why: `${got}/${items.length} listed fields found${levelHere.length ? `, level ${levelHere.join("/")} ${levelsOk ? "ok" : "missing"}` : ""}` };
  }

  // Generic: ids, numbers, level words, above/below.
  const checks: Array<[string, boolean]> = [];
  for (const id of idsIn(k)) checks.push([id, text.includes(id)]);
  for (const n of numbersIn(k)) checks.push([String(n), hasNumber(text, n)]);
  for (const l of LEVELS) if (new RegExp(`\\b${l}\\b`).test(k)) checks.push([l, hasLevel(text, l)]);
  if (/\babove\b/i.test(k)) checks.push(["above", ABOVE_RE.test(text)]);
  if (/\bbelow\b/i.test(k)) checks.push(["below", BELOW_RE.test(text)]);
  if (!checks.length) return { key_point: k, pass: null, why: "not checkable in text" };
  const missing = checks.filter(([, ok]) => !ok).map(([what]) => what);
  return { key_point: k, pass: missing.length === 0, why: missing.length ? `missing ${missing.join(", ")}` : `found ${checks.map(([w]) => w).join(", ")}` };
}

/** The winner is named: it appears in a sentence with a winner word, or it is the first candidate mentioned. */
export function winnerNamed(text: string, winner: string, candidates: string[], winnerRe: RegExp = WINNER_RE): boolean {
  if (!text.includes(winner)) return false;
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    if (!s.includes(winner) || !winnerRe.test(s)) continue;
    const others = candidates.filter((c) => c !== winner && s.includes(c));
    // a sentence naming the winner first, or alone, with a winner word
    if (!others.length || s.indexOf(winner) < Math.min(...others.map((o) => s.indexOf(o)))) return true;
  }
  const first = candidates.map((c) => ({ c, i: text.indexOf(c) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
  return first?.c === winner;
}

// ------------------------------------------------------------------ strict mode (brakes sets)

export interface StrictOptions {
  /** The answer prose alone (ids and invented numbers are judged on it). */
  prose: string;
  /** Text the answer may take numbers from: question, context, tool summaries of the conversation, earlier turns. */
  allowed: string;
}

const CERTS = ["ISO 9001", "IATF 16949", "ECE R90", "ISO/TS 22163", "ISO 14001", "ISO 45001"];
/** Refusal wording of the brake set on top of REFUSAL_RE: missing delivery history, forecasts, catalog gaps. */
const BRAKE_REFUSAL_RE =
  /no (?:delivery (?:rating|history)|order history|price forecasts?|forecasts?|offering|supplier in the catalog)|not (?:stored|tracked|available)|speculat|not in the (?:catalog|database)|(?:can ?not|can't) be (?:calculated|determined|estimated)|unavailable|does not (?:offer|exist)|none of the [\w ]{0,30}(?:offer|supplier)/i;
const WINNER_STRICT_RE = new RegExp(`${WINNER_RE.source}|award|cheapest|go with|choose|select`, "i");
/** Certification codes are names, not numbers. */
const stripCodes = (text: string) => text.replace(/\b(?:ISO(?:\/TS)?|IATF|ECE\s?R)\s?\d{2,5}\b/gi, " ");

const STOP_KP = new Set(
  "states state stated says names mentions gives explains flags points out that the a an is are it its of to in on for and or with as by this be".split(" "),
);
const stem = (w: string) => w.slice(0, 5);

/** Key point with nothing checkable: its content words, normalised, must (almost all) appear in the text. */
function phraseContained(kp: string, text: string): { pass: boolean; why: string } {
  const t = norm(text).replace(/[^a-z0-9 ]+/g, " ");
  const country = kp.match(/^country\s+(.+)$/i);
  if (country) {
    const parts = country[1].split(",").map((x) => norm(x)).filter(Boolean);
    return { pass: parts.every((x) => t.includes(x)), why: `country ${country[1]}` };
  }
  if (/higher score\s*=\s*higher risk|score direction/i.test(kp)) return { pass: DIRECTION_RE.test(text), why: "direction phrase" };
  if (/meets? the certification and capacity/i.test(kp))
    return { pass: /(?:meets?|holds?|has|satisf)[^.]{0,80}(?:certif|ISO)/i.test(text) && /capacity/i.test(text), why: "meets certification and capacity" };
  if (/only failed requirement/i.test(kp)) return { pass: /\bonly\b[^.]{0,40}(?:requirement|criteri|reason|fail)|single (?:requirement|criterion|reason)|(?:requirement|criterion) it fails/i.test(text), why: "only failed requirement" };
  if (/delivery rating stated/i.test(kp)) return { pass: /delivery rating[^.]{0,40}\d/i.test(text), why: "delivery rating with a number" };
  if (/no delivery history/i.test(kp)) return { pass: /no (?:delivery|order) history|no delivery rating|delivery rating[^.]{0,40}not available/i.test(text), why: "no delivery history phrase" };
  if (/prospect/i.test(kp) && !idsIn(kp).length) return { pass: /\bprospect\b/i.test(text), why: "prospect named" };
  const words = norm(kp)
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(" ")
    .filter((w) => w.length > 1 && !STOP_KP.has(w));
  if (!words.length) return { pass: false, why: "no content words" };
  const tw = new Set(t.split(" ").map(stem));
  const hit = words.filter((w) => tw.has(stem(w))).length;
  const need = Math.max(1, Math.ceil(words.length * 0.75));
  return { pass: hit >= need, why: `${hit}/${words.length} content words (need ${need}), approximate` };
}

function gradeStrict(item: EvalItem, text: string, o: StrictOptions): Grade | null {
  const method = item.evaluation.method;
  const exp = item.expected ?? {};
  if (method === "set_match") {
    if (Array.isArray(exp.values)) {
      const want = (exp.values as unknown[]).map(String);
      const vocab = CERTS.some((c) => want.includes(c)) ? CERTS : want;
      const found = vocab.filter((v) => norm(o.prose).includes(norm(v)));
      const tp = found.filter((v) => want.includes(v)).length;
      const ok = tp === want.length && found.length === want.length;
      return { method, pass: ok, score: ok ? 1 : 0, detail: `values: precision ${tp}/${found.length}, recall ${tp}/${want.length}${ok ? "" : ", not the exact set"}` };
    }
    const expected = ((exp.ids_ordered ?? exp.ids ?? []) as string[]).map(String);
    const fromQuestion = new Set(idsIn(item.question).filter((id) => !expected.includes(id)));
    const found = idsIn(o.prose).filter((id) => !fromQuestion.has(id));
    const tp = found.filter((id) => expected.includes(id)).length;
    const exact = tp === expected.length && found.length === expected.length;
    const precision = found.length ? tp / found.length : expected.length ? 0 : 1;
    const recall = expected.length ? tp / expected.length : 1;
    return {
      method,
      pass: exact,
      score: Math.round(((precision + recall) / 2) * 100) / 100,
      detail: `precision ${tp}/${found.length}, recall ${tp}/${expected.length}${exact ? ", exact set" : ", not the exact set"}`,
    };
  }
  if (method === "exact_match_id") {
    const winner = String(exp.answer_id ?? "");
    const candidates = item.supplier_ids?.length ? item.supplier_ids : Object.keys((exp.values as Record<string, unknown>) ?? {});
    const ok = winnerNamed(text, winner, candidates, WINNER_STRICT_RE);
    return { method, pass: ok, score: ok ? 1 : 0, detail: `${winner} ${ok ? "named as winner" : text.includes(winner) ? "mentioned, not as winner" : "not mentioned"}` };
  }
  if (method === "refusal") {
    const says = REFUSAL_RE.test(o.prose) || BRAKE_REFUSAL_RE.test(o.prose);
    const allowed = numbersIn(stripCodes(o.allowed));
    const invented = [...new Set(numbersIn(stripCodes(o.prose)))].filter(
      (n) => !(Number.isInteger(n) && (Math.abs(n) <= 12 || n === 100)) && !allowed.some((a) => near(a, n, 0.005, 0.0005)),
    );
    const ok = says && invented.length === 0;
    return {
      method,
      pass: ok,
      score: ok ? 1 : 0,
      detail: `${says ? "says not available" : "no refusal phrase"}; ${invented.length ? `invented numbers: ${invented.slice(0, 5).join(", ")}` : "no invented number"}`,
    };
  }
  if (method === "exact_match" && typeof exp.value === "string" && /^(yes|no)$/i.test(exp.value)) {
    // The first yes-or-no statement in the prose decides.
    const at = (re: RegExp) => o.prose.search(re);
    const yes = at(/\byes\b|\bfits\b|\bmeets the (?:minimum|moq)|\bholds? (?:the )?(?:ISO|IATF|ECE)/i);
    const no = at(/\bno\b(?![- ](?:delivery|order) history)|\bnot (?:\w+ ){0,3}certified\b|\bdoes(?: not|n't) (?:hold|have|meet|fit)\b|\bis above the (?:monthly )?call-off/i);
    const said = yes < 0 && no < 0 ? null : no < 0 || (yes >= 0 && yes < no) ? "yes" : "no";
    const ok = said === exp.value.toLowerCase();
    return { method, pass: ok, score: ok ? 1 : 0, detail: `expected ${exp.value}, the prose says ${said ?? "neither"}` };
  }
  if (method === "exact_match" || method === "numeric") return grade(item, stripCodes(text));
  if (method === "rubric") {
    const kps = (item.evaluation.key_points ?? []).map((kp) => {
      const r = checkKeyPoint(kp, text);
      if (r.pass !== null) return { ...r, approximate: false };
      const p = phraseContained(kp, text);
      return { key_point: r.key_point, pass: p.pass, why: p.why, approximate: true };
    });
    const passed = kps.filter((k) => k.pass).length;
    return {
      method,
      pass: kps.length ? passed === kps.length : null,
      score: kps.length ? Math.round((100 * passed) / kps.length) / 100 : null,
      approximate: kps.some((k) => k.approximate),
      detail: `${passed}/${kps.length} key points (${kps.filter((k) => k.approximate).length} by phrase containment, approximate)`,
      key_points: kps.map(({ key_point, pass, why }) => ({ key_point, pass, why })),
    };
  }
  return null;
}

export function grade(item: EvalItem, text: string, opts?: { strict?: StrictOptions }): Grade {
  if (opts?.strict) {
    const g = gradeStrict(item, text, opts.strict);
    if (g) return g;
  }
  const method = item.evaluation.method;
  const exp = item.expected ?? {};
  switch (method) {
    case "exact_match": {
      const checks: string[] = [];
      let ok = true;
      if (typeof exp.value === "number") {
        const hit = numbersIn(text).some((n) => near(n, exp.value as number, 1e-6));
        ok &&= hit;
        checks.push(`value ${exp.value} ${hit ? "found" : "missing"}`);
      } else if (typeof exp.value === "string") {
        const hit = norm(text).includes(norm(exp.value));
        ok &&= hit;
        checks.push(`value "${exp.value}" ${hit ? "found" : "missing"}`);
      }
      if (typeof exp.level === "string") {
        const hit = hasLevel(text, exp.level);
        ok &&= hit;
        checks.push(`level ${exp.level} ${hit ? "found" : "missing"}`);
      }
      return { method, pass: checks.length ? ok : null, score: checks.length ? (ok ? 1 : 0) : null, detail: checks.join("; ") };
    }
    case "exact_match_id": {
      const winner = String(exp.answer_id ?? "");
      const candidates = item.supplier_ids?.length ? item.supplier_ids : Object.keys((exp.values as Record<string, unknown>) ?? {});
      const ok = winnerNamed(text, winner, candidates);
      return { method, pass: ok, score: ok ? 1 : 0, detail: `${winner} ${ok ? "named as winner" : text.includes(winner) ? "mentioned, not as winner" : "not mentioned"}` };
    }
    case "numeric": {
      const v = Number(exp.value);
      const tol = item.evaluation.tolerance ?? {};
      const nums = numbersIn(text);
      const hit = nums.find((n) => near(n, v, tol.abs ?? 0, tol.rel ?? 0));
      const closest = nums.length ? nums.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a)) : null;
      return {
        method,
        pass: hit !== undefined,
        score: hit !== undefined ? 1 : 0,
        detail: `expected ${v} (${tol.abs !== undefined ? `abs ${tol.abs}` : `rel ${tol.rel}`}); ${hit !== undefined ? `found ${hit}` : `closest ${closest ?? "none"}`}`,
      };
    }
    case "set_match": {
      const expected = ((exp.ids_ordered ?? exp.ids ?? []) as string[]).map(String);
      const fromQuestion = new Set(idsIn(item.question).filter((id) => !expected.includes(id)));
      const found = idsIn(text).filter((id) => !fromQuestion.has(id));
      const tp = found.filter((id) => expected.includes(id)).length;
      const precision = found.length ? tp / found.length : 0;
      const recall = expected.length ? tp / expected.length : 0;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      return {
        method,
        pass: f1 >= 0.8,
        score: Math.round(f1 * 100) / 100,
        detail: `precision ${tp}/${found.length}, recall ${tp}/${expected.length}, F1 ${f1.toFixed(2)}`,
      };
    }
    case "refusal": {
      const ok = REFUSAL_RE.test(text);
      return { method, pass: ok, score: ok ? 1 : 0, detail: ok ? "says the information is not available" : "no refusal phrase" };
    }
    default: {
      const kps = (item.evaluation.key_points ?? []).map((kp) => checkKeyPoint(kp, text));
      const checkable = kps.filter((r) => r.pass !== null);
      const passed = checkable.filter((r) => r.pass).length;
      return {
        method,
        pass: checkable.length ? passed === checkable.length : null,
        score: checkable.length ? Math.round((100 * passed) / checkable.length) / 100 : null,
        detail: `${passed}/${checkable.length} checkable key points (${kps.length - checkable.length} not checkable)`,
        key_points: kps,
      };
    }
  }
}
