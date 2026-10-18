/**
 * Splitting and checking the assistant's final text. Client-safe (no server imports):
 * the chat panel can use splitAssistantText while the text part is still streaming.
 *
 * Answer format the model is asked for:
 *   1 to 3 sentences of prose
 *   ```openui-lang
 *   root = Verdict("cmp_1a2b3c4d")
 *   ```
 */
export interface SplitAnswer {
  prose: string;
  /** OpenUI Lang program, or null when the answer is prose only. */
  code: string | null;
}

const FENCE = /```[ \t]*(?:openui-lang|openui|oui)?[ \t]*\n([\s\S]*?)(?:```|$)/i;

export function splitAssistantText(text: string): SplitAnswer {
  const m = text.match(FENCE);
  if (m && /\broot\s*=/.test(m[1])) {
    const prose = (text.slice(0, m.index) + text.slice((m.index ?? 0) + m[0].length)).trim();
    return { prose, code: m[1].trim() };
  }
  // Unfenced program: everything from the first `root =` line on.
  const lines = text.split("\n");
  const start = lines.findIndex((l) => /^\s*root\s*=/.test(l));
  if (start >= 0) {
    const codeLines = lines.slice(start).filter((l) => /^\s*[A-Za-z_][\w]*\s*=/.test(l));
    const proseLines = [...lines.slice(0, start), ...lines.slice(start).filter((l) => !/^\s*[A-Za-z_][\w]*\s*=/.test(l))];
    return { prose: proseLines.join("\n").trim(), code: codeLines.join("\n").trim() };
  }
  return { prose: text.trim(), code: null };
}

/** A "Next: ..." nudge line, optionally wrapped in Markdown emphasis or a list bullet. */
const NEXT_LINE = /^\s*(?:[-*>]\s+)?[*_]{0,2}next\s*(?:step|question)?\s*[:：][*_]{0,2}\s*(.*?)\s*[*_]{0,2}\s*$/i;

/** One nudge as the buyer would send it: no quotes or emphasis around it, no trailing spaces. */
function cleanNext(raw: string): string {
  return raw
    .replace(/^[*_"'“”‘’`]+|[*_"'“”‘’`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Takes the model's next-step nudge out of the prose: every "Next: ..." line is removed (the chat shows the nudge
 * once, as the primary chip), and the last one becomes `next`, capitalised. Safe on partial streaming text.
 */
export function splitNextLine(prose: string): { prose: string; next: string | null } {
  let next: string | null = null;
  const kept: string[] = [];
  for (const line of prose.split("\n")) {
    const m = NEXT_LINE.exec(line);
    if (m) {
      const q = cleanNext(m[1]);
      if (q) next = q.charAt(0).toUpperCase() + q.slice(1);
      continue;
    }
    kept.push(line);
  }
  return { prose: kept.join("\n").trim(), next };
}

/** Quoted strings that look like result handles (kind_8hex), e.g. "cmp_1a2b3c4d". */
export function handlesIn(code: string): string[] {
  return [...code.matchAll(/"([a-z]+_[0-9a-f]{8})"/g)].map((m) => m[1]);
}

export interface AnswerPart {
  /** The answer's prose without the "Next:" line. */
  prose: string;
  /** The model's single next-step question ("Compare the top 3?"), rendered as the primary chip; null when absent. */
  next?: string | null;
  /** The OpenUI Lang program to render (null = prose only). */
  openui: string | null;
  source: "model" | "fallback" | "none";
  /** Problems found in the model's program (empty when it was used as is). */
  issues: string[];
}
