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
  /** null = nothing checkable (counted as ungraded) */
  pass: boolean | null;
  score: number | null;
  detail: string;
  key_points?: KeyPointResult[];
}

const LEVELS = ["Low", "Medium", "High", "Critical"];

export const idsIn = (text: string): string[] => [...new Set([...text.matchAll(/\bSUPP[_-]?(\d{1,5})\b/gi)].map((m) => `SUPP_${m[1].padStart(5, "0")}`))];

/** Numbers in the text, with k / M / bn suffixes applied as extra candidates. Supplier ids are removed first. */
export function numbersIn(text: string): number[] {
  const clean = text.replace(/\bSUPP[_-]?\d{1,5}\b/gi, " ").replace(/\b(?:Q[1-4]|20\d\d-\d\d-\d\d)\b/g, " ");
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
export function winnerNamed(text: string, winner: string, candidates: string[]): boolean {
  if (!text.includes(winner)) return false;
  const sentences = text.split(/(?<=[.!?\n])\s+/);
  for (const s of sentences) {
    if (!s.includes(winner) || !WINNER_RE.test(s)) continue;
    const others = candidates.filter((c) => c !== winner && s.includes(c));
    // a sentence naming the winner first, or alone, with a winner word
    if (!others.length || s.indexOf(winner) < Math.min(...others.map((o) => s.indexOf(o)))) return true;
  }
  const first = candidates.map((c) => ({ c, i: text.indexOf(c) })).filter((x) => x.i >= 0).sort((a, b) => a.i - b.i)[0];
  return first?.c === winner;
}

export function grade(item: EvalItem, text: string): Grade {
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
