"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ActionEvent } from "@openuidev/react-lang";
import { ArrowUp, Check, CornerDownRight, RotateCw, Square, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Composer, Dots, IconButton, Spinner, Switch } from "@/design-system/react";
import { BlockEnvProvider } from "@/components/ui-blocks/block-context";
import { useCases } from "@/lib/cases/store";
import { cn } from "@/lib/utils";
import { VIEW_LIMITS, type ViewBlock, type ViewContext, type WorkflowContext } from "@/skills/types";
import { AssistantText, UiSegment } from "./assistant-text";
import { Markdown } from "@/components/ui-blocks/markdown";
import { createDemoTransport, DEMO_SUGGESTIONS, primeDemoFixtures } from "./demo-transport";
import { applyUiActionToStore, describeUiAction, parseUiActions, type UiAction } from "./ui-actions";
import { buildWorkflowContext } from "./workflow-context";

/** Demo mode default: NEXT_PUBLIC_CHAT_DEMO=1 turns it on; the header switch toggles it at runtime. */
export const DEMO_DEFAULT = process.env.NEXT_PUBLIC_CHAT_DEMO === "1";

export interface ChatPanelProps {
  /** Sourcing case the chat works on; its stage, profile and shortlist become the WorkflowContext. */
  caseId: string;
  /** Suggestion chips (e.g. from the skill registry's examples). Demo mode falls back to its own. */
  suggestions?: string[];
  /**
   * Called for every UI action, from the model (data part, tool output or message metadata) or from a block.
   * Shortlist, profile and stage actions are already applied to the case store when this fires;
   * open_supplier, open_compare, start_research and assign_part are for the page to handle.
   */
  onAction?: (action: UiAction) => void;
  /** Controlled selected supplier; otherwise open_supplier actions set it. */
  selectedSupplier?: string | null;
  /**
   * Prebuilt workflow context (e.g. the case screens' buildWorkflowContext). Sent as is, on top of the
   * context the panel derives from the case store; its selected_supplier wins over selectedSupplier.
   */
  context?: Partial<WorkflowContext> & Record<string, unknown>;
  workflowStep?: WorkflowContext["workflow_step"];
  buyerInputs?: WorkflowContext["buyer_inputs"];
  /** Force demo mode on/off and hide the switch. */
  demo?: boolean;
  api?: string;
  /** Name written to the case log for store changes made by the chat. */
  who?: string;
  title?: string;
  className?: string;
  /**
   * "panel" (default): side panel with a header, demo switch and context pills.
   * "page": the chat is the screen; no header, a centred reading column, quiet composer.
   */
  variant?: "panel" | "page";
  /** Opening assistant message shown above the thread (built by the page, no LLM call). Replaces the empty state. */
  intro?: ReactNode;
  placeholder?: string;
  /**
   * The page's part of what the buyer sees (sent as workflow.view with every turn): screen label, filter chip texts,
   * unsaved form inputs. The panel adds the blocks it rendered and the ids they show.
   */
  view?: Partial<Pick<ViewContext, "screen" | "filters_shown" | "draft_inputs">>;
}

/** Blocks referenced by the rendered answers, most recent message first, reading order within a message. */
function blocksShown(messages: UIMessage[]): ViewBlock[] {
  const out: ViewBlock[] = [];
  const seen = new Set<string>();
  for (let i = messages.length - 1; i >= 0; i--) {
    const program = messages[i].role === "assistant" ? answerOf(messages[i])?.openui : null;
    if (!program) continue;
    for (const m of program.matchAll(/\b([A-Z][A-Za-z]+)\(\s*(?:resultId\s*[=:]\s*)?"([a-z][a-z_]*_[0-9a-z]{8,})"/g)) {
      const key = `${m[1]}:${m[2]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ component: m[1], result_id: m[2] });
    }
  }
  return out;
}

/** Page variant composer: one quiet single-line input and one send button. Enter sends. */
function QuietComposer({ placeholder, disabled, onSubmit }: { placeholder: string; disabled: boolean; onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim() || disabled) return;
    onSubmit(text);
    setText("");
  };
  return (
    <form
      data-composer
      className="flex h-12 items-center gap-2 rounded-full bg-sunken pl-5 pr-1.5 focus-within:ring-2 focus-within:ring-[var(--lw-focus-ring)]"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        aria-label="Message"
        className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-placeholder disabled:opacity-60"
      />
      <IconButton type="submit" aria-label="Send" shape="round" size="sm" variant={text.trim() ? "primary" : "ghost"} disabled={disabled || !text.trim()}>
        <ArrowUp />
      </IconButton>
    </form>
  );
}

/** Chips that refer to what is on screen (the latest answer's blocks). */
function viewSuggestions(blocks: ViewBlock[]): string[] {
  const latest = blocks[0]?.component;
  if (latest === "RankedList") return ["Compare the top 3 shown"];
  if (latest === "CompareGrid" || latest === "Verdict" || latest === "RadarProfile") return ["Explain the top one shown"];
  return [];
}

type Part = UIMessage["parts"][number];

/** The route sends data-ui-actions { tool_call_id, skill, actions }; the other names are accepted for other producers (demo, tests). */
const UI_ACTION_PARTS = new Set(["data-ui-actions", "data-ui_actions", "data-ui_action", "data-actions"]);

/** Final render instruction from the route (src/lib/llm/answer.ts AnswerPart). */
interface AnswerLike {
  prose?: string;
  openui?: string | null;
  source?: "model" | "fallback" | "none";
  issues?: string[];
}

function answerOf(m: UIMessage): AnswerLike | null {
  const p = m.parts.find((x) => x.type === "data-answer") as { data?: unknown } | undefined;
  return p?.data && typeof p.data === "object" ? (p.data as AnswerLike) : null;
}

/** UI actions carried by one message part: a data-ui-actions part, or a tool output with ui_actions. */
function actionsOfPart(part: Part): UiAction[] | null {
  if (UI_ACTION_PARTS.has(part.type)) return parseUiActions((part as { data?: unknown }).data);
  if (isToolUIPart(part) && part.state === "output-available") {
    const out = part.output as { ui_actions?: unknown } | null | undefined;
    return out && typeof out === "object" && "ui_actions" in out ? parseUiActions(out.ui_actions) : null;
  }
  return null;
}

/**
 * Dedupe key. The route repeats a skill's actions in its tool output and in a data-ui-actions part that names
 * the tool call, so both map to the same key and apply once.
 */
function partKey(m: UIMessage, part: Part, i: number) {
  if (isToolUIPart(part)) return `${m.id}:tool:${part.toolCallId}`;
  const callId = toolCallIdOf(part);
  if (callId) return `${m.id}:tool:${callId}`;
  return `${m.id}:${part.type}:${(part as { id?: string }).id ?? i}`;
}

function toolCallIdOf(part: Part): string | null {
  const data = (part as { data?: unknown }).data;
  const id = data && typeof data === "object" ? (data as { tool_call_id?: unknown }).tool_call_id : null;
  return typeof id === "string" ? id : null;
}

function ToolChip({ part }: { part: Part }) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);
  const summary = part.state === "output-available" ? (part.output as { summary?: unknown } | undefined)?.summary : undefined;
  if (part.state === "output-error")
    return (
      <Badge tone="danger" size="sm" title={part.errorText}>
        <TriangleAlert /> {name} failed
      </Badge>
    );
  const done = part.state === "output-available";
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 text-xs text-subtext" title={typeof summary === "string" ? summary : undefined}>
      <Badge tone="outline" size="sm" className="font-mono">
        {done ? <Check className="text-[var(--risk-low)]" /> : <Spinner size="sm" className="size-3" label={`Running ${name}`} />}
        {done ? name : `running ${name}`}
      </Badge>
      {typeof summary === "string" && <span className="truncate">{summary}</span>}
    </span>
  );
}

function Receipt({ actions }: { actions: UiAction[] }) {
  if (!actions.length) return null;
  return (
    <ul className="space-y-0.5">
      {actions.map((a, i) => (
        <li key={i} className="flex items-center gap-1 text-xs text-subtext">
          <CornerDownRight className="size-3 text-tertiary" />
          {describeUiAction(a)}
        </li>
      ))}
    </ul>
  );
}

export function ChatPanel({
  caseId,
  suggestions,
  onAction,
  selectedSupplier,
  context,
  workflowStep,
  buyerInputs,
  demo: demoProp,
  api = "/api/chat",
  who = "Assistant",
  title = "Ask about suppliers",
  className,
  variant = "panel",
  intro,
  placeholder,
  view,
}: ChatPanelProps) {
  const page = variant === "page";
  const sourcingCase = useCases((s) => s.cases[caseId]);
  const [demoState, setDemoState] = useState(DEMO_DEFAULT);
  const demo = demoProp ?? demoState;
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const selected =
    context && "selected_supplier" in context ? ((context.selected_supplier as string | null) ?? null) : selectedSupplier !== undefined ? selectedSupplier : selectedState;

  const workflow = useMemo(
    () => ({ ...buildWorkflowContext(sourcingCase, { caseId, selectedSupplier: selected, workflowStep, buyerInputs }), ...(context ?? {}) }) as WorkflowContext,
    [sourcingCase, caseId, selected, workflowStep, buyerInputs, context],
  );

  const liveTransport = useMemo(() => new DefaultChatTransport<UIMessage>({ api }), [api]);
  const demoTransport = useMemo(() => createDemoTransport(), []);

  useEffect(() => {
    if (demo) void primeDemoFixtures();
  }, [demo]);

  const handleAction = useCallback(
    (action: UiAction) => {
      applyUiActionToStore(action, caseId, who);
      if (action.type === "open_supplier") setSelectedState(action.id);
      onAction?.(action);
    },
    [caseId, who, onAction],
  );

  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({
    id: `chat:${caseId}`,
    transport: demo ? demoTransport : liveTransport,
    // Transient data parts never reach message.parts, so they are applied here; persisted ones in the effect below.
    onData: (part) => {
      if ((part as { transient?: boolean }).transient && UI_ACTION_PARTS.has(part.type)) parseUiActions((part as { data?: unknown }).data).forEach(handleAction);
    },
  });

  // Apply ui_actions from data parts, tool outputs and message metadata exactly once each.
  const applied = useRef(new Set<string>());
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      m.parts.forEach((part, i) => {
        const actions = actionsOfPart(part);
        if (!actions?.length) return;
        const key = partKey(m, part, i);
        if (applied.current.has(key)) return;
        applied.current.add(key);
        actions.forEach(handleAction);
      });
      const meta = parseUiActions((m.metadata as { ui_actions?: unknown } | undefined)?.ui_actions);
      if (meta.length && !applied.current.has(`${m.id}:meta`)) {
        applied.current.add(`${m.id}:meta`);
        meta.forEach(handleAction);
      }
    }
  }, [messages, handleAction]);

  const busy = status === "submitted" || status === "streaming";
  // What the buyer sees: blocks report their visible ids here; the view is assembled when a turn is sent.
  const reports = useRef(new Map<string, ViewBlock>());
  const report = useCallback((b: ViewBlock) => {
    reports.current.set(`${b.component}:${b.result_id}`, b);
  }, []);
  const shownBlocks = useMemo(() => blocksShown(messages), [messages]);
  const currentView = useCallback(
    (): ViewContext => ({
      screen: view?.screen ?? (page ? "case chat" : "chat panel"),
      blocks: shownBlocks.slice(0, VIEW_LIMITS.blocks).map((b) => {
        const r = reports.current.get(`${b.component}:${b.result_id}`);
        return { ...b, ...(r?.label ? { label: r.label } : {}), visible_ids: (r?.visible_ids ?? []).slice(0, VIEW_LIMITS.ids) };
      }),
      ...(view?.filters_shown ? { filters_shown: view.filters_shown.slice(0, VIEW_LIMITS.filters) } : {}),
      ...(view?.draft_inputs && Object.keys(view.draft_inputs).length ? { draft_inputs: view.draft_inputs } : {}),
    }),
    [view, page, shownBlocks],
  );

  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      void sendMessage({ text: t }, { body: { workflow: { ...workflow, view: currentView() } } });
    },
    [busy, sendMessage, workflow, currentView],
  );

  const onRendererAction = useCallback(
    (e: ActionEvent) => {
      if (e.type === "continue_conversation") send(e.humanFriendlyMessage || String(e.params.message ?? ""));
      else if (e.type === "open_url" && typeof e.params.url === "string" && /^https?:\/\//.test(e.params.url)) window.open(e.params.url, "_blank", "noopener,noreferrer");
      else parseUiActions({ type: e.type, ...e.params }).forEach(handleAction);
    },
    [send, handleAction],
  );

  // Suggestion chips: prop > demo prompts > the route's skill catalog (GET /api/chat).
  const [catalog, setCatalog] = useState<string[]>([]);
  useEffect(() => {
    if (suggestions?.length || demo) return;
    let live = true;
    fetch(api, { method: "GET" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { skills?: Array<{ priority?: string; examples?: string[] }> } | null) => {
        if (!live || !j?.skills) return;
        setCatalog(j.skills.filter((sk) => sk.priority === "core" && sk.examples?.length).map((sk) => sk.examples![0]).slice(0, 8));
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [api, demo, suggestions]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Chips the buyer already sent are dropped, so the row always offers a next step.
  const norm = (t: string) => t.trim().toLowerCase().replace(/[?.!]+$/, "");
  const asked = new Set(messages.filter((m) => m.role === "user").map((m) => norm(m.parts.map((p) => (p.type === "text" ? p.text : "")).join(""))));
  const baseChips = suggestions?.length ? suggestions : demo ? DEMO_SUGGESTIONS : catalog;
  const chips = [...(page ? viewSuggestions(shownBlocks) : []), ...baseChips].filter((c) => !asked.has(norm(c))).slice(0, page ? 3 : undefined);
  const routeMissing = !!error && /501|not implemented|404|Failed to fetch/i.test(error.message);
  const shortlistCount = workflow.shortlist?.length ?? 0;
  /** Reading column: full width in the side panel, centred in the page variant. */
  const column = page ? "mx-auto w-full max-w-4xl" : "";

  return (
    <BlockEnvProvider caseId={caseId} who={who} dispatch={handleAction} ask={send} report={report}>
      <section data-chat-panel data-variant={variant} className={cn("flex h-full min-h-0 flex-col bg-canvas text-sm text-ink", className)}>
        <header className={cn("flex items-center justify-between gap-3 border-b border-line px-4 py-2.5", page && "hidden")}>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate text-xs text-subtext">
              {workflow.buyer_inputs?.category ?? caseId} · {String(workflow.workflow_step).replace("_", " ")} · profile {workflow.profile_id}
            </p>
          </div>
          {demoProp === undefined ? (
            <label className="flex shrink-0 items-center gap-2 text-xs text-subtext">
              Demo
              <Switch size="sm" checked={demoState} onCheckedChange={setDemoState} aria-label="Demo mode: canned answers and fixture data" />
            </label>
          ) : demo ? (
            <Badge size="sm">Demo</Badge>
          ) : null}
        </header>

        <div ref={scrollRef} className={cn("min-h-0 flex-1 overflow-y-auto px-4", page ? "py-6" : "py-4")}>
          <div className={column}>
          {intro ? <div className={cn(messages.length > 0 && "mb-5")}>{intro}</div> : null}
          {messages.length === 0 ? (
            intro ? null : (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
              <p className="text-md font-semibold">What do you need to know about your suppliers?</p>
              <p className="text-sm text-subtext">
                Answers come from the supplier dataset{demo ? " (demo: canned answers on fixture data)" : ""}. Blocks fetch their numbers directly, so what you see is what the data says.
              </p>
            </div>
            )
          ) : (
            <ol className={cn("flex flex-col", page ? "gap-10" : "gap-5")}>
              {messages.map((m, mi) => {
                const last = mi === messages.length - 1;
                if (m.role === "user")
                  return (
                    <li key={m.id} className="flex justify-end">
                      <div className={cn("max-w-[85%] whitespace-pre-wrap bg-sunken text-sm text-ink", page ? "rounded-2xl px-4 py-2.5" : "rounded-xl px-3 py-2")}>
                        {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                      </div>
                    </li>
                  );
                const answer = answerOf(m);
                const toolCalls = new Set(m.parts.filter(isToolUIPart).map((p) => p.toolCallId));
                return (
                  <li key={m.id} className="flex min-w-0 flex-col gap-2">
                    {m.parts.map((p, i) => {
                      // Page variant: only the answer itself; no tool chips, receipts or source notes.
                      if (page && (isToolUIPart(p) || UI_ACTION_PARTS.has(p.type))) return null;
                      if (isToolUIPart(p)) {
                        const acts = actionsOfPart(p);
                        return (
                          <div key={i} className="flex flex-col gap-1">
                            <ToolChip part={p} />
                            {acts?.length ? <Receipt actions={acts} /> : null}
                          </div>
                        );
                      }
                      // Once the route's data-answer arrives it is the source of truth; live text only shows until then.
                      if (p.type === "text") {
                        if (answer) return null;
                        const streaming = last && status === "streaming" && p.state !== "done";
                        return <AssistantText key={i} text={p.text} isStreaming={streaming} onAction={onRendererAction} />;
                      }
                      if (UI_ACTION_PARTS.has(p.type)) {
                        const callId = toolCallIdOf(p);
                        if (callId && toolCalls.has(callId)) return null; // receipt already shown under its tool chip
                        const acts = actionsOfPart(p);
                        return acts?.length ? <Receipt key={i} actions={acts} /> : null;
                      }
                      return null;
                    })}
                    {answer && (
                      <div className="flex min-w-0 flex-col gap-3">
                        {answer.prose?.trim() && <Markdown text={answer.prose} className="space-y-1.5 text-sm leading-relaxed text-ink" />}
                        {answer.openui && <UiSegment source={answer.openui} isStreaming={false} onAction={onRendererAction} />}
                        {answer.source === "fallback" && !page && (
                          <p className="text-2xs text-tertiary" title={answer.issues?.join("\n")}>
                            Showing the skill&apos;s default view; the model&apos;s layout had {answer.issues?.length ?? 0} issue{answer.issues?.length === 1 ? "" : "s"}.
                          </p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          {page
            ? busy &&
              !(messages.at(-1)?.role === "assistant" && answerOf(messages.at(-1)!)) && (
                <div className="mt-6 flex text-subtext" aria-label="Answering">
                  <Dots />
                </div>
              )
            : status === "submitted" && (
                <div className="mt-4 flex items-center gap-2 text-xs text-subtext">
                  <Dots /> Thinking
                </div>
              )}
          {error && (
            <Alert
              tone="danger"
              className="mt-4 p-3"
              title={routeMissing && !demo ? "The chat service is not available" : "Something went wrong"}
              action={
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    leading={<RotateCw />}
                    onClick={() => {
                      clearError();
                      void regenerate({ body: { workflow: { ...workflow, view: currentView() } } });
                    }}
                  >
                    Retry
                  </Button>
                  {routeMissing && !demo && demoProp === undefined && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        clearError();
                        setDemoState(true);
                      }}
                    >
                      Use demo mode
                    </Button>
                  )}
                </div>
              }
            >
              {error.message.slice(0, 240)}
            </Alert>
          )}
          </div>
        </div>

        <div className={cn("px-4 pb-4", page ? "pt-2" : "border-t border-line pt-3")}>
          <div className={column}>
          {chips.length > 0 && !busy && (
            <div className={cn("mb-2 flex gap-1.5 pb-1", page ? "flex-wrap" : "overflow-x-auto")} data-chat-chips>
              {chips.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  variant={page ? "ghost" : "secondary"}
                  pill
                  className={cn("h-7 shrink-0 px-2.5 text-xs", page && "bg-sunken text-subtext hover:bg-hover hover:text-ink")}
                  onClick={() => send(s)}
                >
                  {s}
                </Button>
              ))}
            </div>
          )}
          {page ? (
            <QuietComposer placeholder={placeholder ?? "Ask"} disabled={busy} onSubmit={send} />
          ) : (
          <Composer
            placeholder={busy ? "Answering…" : (placeholder ?? "Ask about suppliers, risks, alternatives")}
            disabled={busy}
            onSubmit={send}
            showMic={false}
            leadingAction={<span />}
            pills={
              <>
                <Badge size="sm" tone="outline">
                  {String(workflow.workflow_step).replace("_", " ")}
                </Badge>
                <Badge size="sm" tone="outline">
                  profile {workflow.profile_id}
                </Badge>
                <Badge size="sm" tone="outline">
                  {shortlistCount} shortlisted
                </Badge>
                {selected && (
                  <Badge size="sm" tone="outline" className="font-mono">
                    {selected}
                  </Badge>
                )}
              </>
            }
            toolbar={
              busy ? (
                <IconButton aria-label="Stop" variant="secondary" shape="round" onClick={() => void stop()}>
                  <Square className="fill-current" />
                </IconButton>
              ) : null
            }
          />
          )}
          </div>
        </div>
      </section>
    </BlockEnvProvider>
  );
}
