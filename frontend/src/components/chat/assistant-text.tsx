"use client";
import { memo, useMemo } from "react";
import { Renderer, type ActionEvent, type OpenUIError } from "@openuidev/react-lang";
import { Markdown } from "@/components/ui-blocks/markdown";
import { library, normalizeResponse } from "@/lib/openui/library";

export interface Segment {
  kind: "prose" | "ui";
  text: string;
  /** True for the last segment while its fence or statement is still streaming. */
  open?: boolean;
}

const STATEMENT = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*\S/;
/** A stream that so far is only a prefix of "root = ..." renders nothing yet. */
const ROOT_PREFIX = /^\s*(r(o(o(t(\s*=?)?)?)?)?)?\s*$/;

/**
 * Split an assistant text part into prose and OpenUI Lang. Handles all three shapes the chat route may send:
 * pure OpenUI Lang, prose with ```openui-lang fences (inline mode), or plain prose.
 */
export function splitAssistantText(text: string): Segment[] {
  if (text.includes("```")) {
    const out: Segment[] = [];
    const re = /```([^\n`]*)\n?/g;
    let pos = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > pos) out.push({ kind: "prose", text: text.slice(pos, m.index) });
      const bodyStart = m.index + m[0].length;
      const close = text.indexOf("```", bodyStart);
      const body = close === -1 ? text.slice(bodyStart) : text.slice(bodyStart, close);
      const lang = m[1].trim().toLowerCase();
      const isUi = lang.startsWith("openui") || (!lang && STATEMENT.test(body.split("\n")[0] ?? ""));
      out.push({ kind: isUi ? "ui" : "prose", text: isUi ? body : "```" + lang + "\n" + body + "\n```", open: close === -1 });
      if (close === -1) return out.filter((s) => s.text.trim());
      pos = close + 3;
      re.lastIndex = pos;
    }
    if (pos < text.length) out.push({ kind: "prose", text: text.slice(pos) });
    return out.filter((s) => s.text.trim());
  }
  if (ROOT_PREFIX.test(text)) return [];
  const lines = text.split("\n");
  const first = lines.findIndex((l) => STATEMENT.test(l));
  if (first === -1) return [{ kind: "prose", text }];
  const prose = lines.slice(0, first).join("\n");
  return [...(prose.trim() ? [{ kind: "prose" as const, text: prose }] : []), { kind: "ui", text: lines.slice(first).join("\n") }];
}

const UiSegment = memo(function UiSegment({
  source,
  isStreaming,
  onAction,
}: {
  source: string;
  isStreaming: boolean;
  onAction?: (event: ActionEvent) => void;
}) {
  const response = useMemo(() => normalizeResponse(source), [source]);
  return (
    <Renderer
      response={response}
      library={library}
      isStreaming={isStreaming}
      onAction={onAction}
      onError={(errors: OpenUIError[]) => {
        if (errors.length && process.env.NODE_ENV !== "production" && !isStreaming) console.warn("[openui]", errors);
      }}
    />
  );
});

export function AssistantText({ text, isStreaming, onAction }: { text: string; isStreaming: boolean; onAction?: (event: ActionEvent) => void }) {
  const segments = useMemo(() => splitAssistantText(text), [text]);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {segments.map((s, i) =>
        s.kind === "ui" ? (
          <UiSegment key={i} source={s.text} isStreaming={isStreaming && i === segments.length - 1} onAction={onAction} />
        ) : s.text.startsWith("```") ? (
          <pre key={i} className="overflow-x-auto rounded-lg bg-sunken p-2 font-mono text-xs text-ink">
            {s.text.replace(/^```[^\n]*\n/, "").replace(/\n```$/, "")}
          </pre>
        ) : (
          <Markdown key={i} text={s.text} className="space-y-1.5 text-sm leading-relaxed text-ink" />
        ),
      )}
    </div>
  );
}
