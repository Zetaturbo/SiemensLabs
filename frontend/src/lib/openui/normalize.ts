/**
 * OpenUI Lang is positional only: `CompareGrid(resultId="x")` parses as an excess argument and the
 * component is dropped (verified against @openuidev/lang-core 1.0.1). Models and hand-written views
 * still produce named arguments, so this rewrites `Name(key=value, key: value)` into positional form
 * using each component's parameter order. Strings, nesting and partial (streaming) input are respected;
 * calls without named arguments pass through unchanged. Pure, safe on server and client.
 */

const IDENT = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const NAMED = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:=(?!=)|:)\s*([\s\S]*?)\s*$/;

function skipString(src: string, i: number): number {
  const q = src[i];
  let j = i + 1;
  while (j < src.length) {
    if (src[j] === "\\") j += 2;
    else if (src[j] === q) return j + 1;
    else j++;
  }
  return src.length;
}

/** Index of the matching close paren for the "(" at `open`, or -1 if the input ends first. */
function matchParen(src: string, open: number): number {
  let depth = 0;
  for (let i = open; i < src.length; ) {
    const c = src[i];
    if (c === '"' || c === "'") {
      i = skipString(src, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return c === ")" ? i : -1;
    }
    i++;
  }
  return -1;
}

function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; ) {
    const c = inner[i];
    if (c === '"' || c === "'") {
      i = skipString(inner, i);
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  if (inner.slice(start).trim() || out.length) out.push(inner.slice(start));
  return out;
}

export function normalizeOpenUi(src: string, params: Record<string, string[]>): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'") {
      const j = skipString(src, i);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (IDENT.test(c) && (i === 0 || !IDENT_CHAR.test(src[i - 1]))) {
      let j = i + 1;
      while (j < src.length && IDENT_CHAR.test(src[j])) j++;
      const name = src.slice(i, j);
      if (src[j] === "(" && params[name]) {
        const close = matchParen(src, j);
        if (close === -1) {
          // Still streaming: leave the tail untouched until the call closes.
          out += src.slice(i);
          break;
        }
        out += name + "(" + rewriteArgs(src.slice(j + 1, close), params[name], params) + ")";
        i = close + 1;
        continue;
      }
      out += name;
      i = j;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

function rewriteArgs(inner: string, order: string[], params: Record<string, string[]>): string {
  const args = splitArgs(inner);
  const named = args.map((a) => a.match(NAMED));
  if (!named.some(Boolean)) return args.map((a) => normalizeOpenUi(a, params)).join(",");
  const byName = new Map<string, string>();
  const positional: string[] = [];
  args.forEach((a, k) => {
    const m = named[k];
    if (m && order.includes(m[1])) byName.set(m[1], m[2]);
    else if (!m) positional.push(a.trim());
  });
  const slots = order.map((p) => byName.get(p) ?? null);
  // Unnamed arguments fill the remaining slots in order.
  for (let k = 0, p = 0; k < slots.length && p < positional.length; k++) if (slots[k] === null) slots[k] = positional[p++];
  let last = slots.length - 1;
  while (last >= 0 && slots[last] === null) last--;
  return slots
    .slice(0, last + 1)
    .map((v) => (v === null ? "null" : normalizeOpenUi(v, params)))
    .join(", ");
}
