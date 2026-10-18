"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ActionEvent } from "@openuidev/react-lang";
import { Check, CornerDownRight, RotateCw, Square, TriangleAlert } from "lucide-react";
import { Alert, Badge, Button, Composer, Dots, IconButton, Spinner, Switch } from "@/design-system/react";
import { BlockEnvProvider } from "@/components/ui-blocks/block-context";
import { useCases } from "@/lib/cases/store";
import { cn } from "@/lib/utils";
import type { WorkflowContext } from "@/skills/types";
import { AssistantText } from "./assistant-text";
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
  workflowStep?: WorkflowContext["workflow_step"];
  buyerInputs?: WorkflowContext["buyer_inputs"];
  /** Force demo mode on/off and hide the switch. */
  demo?: boolean;
  api?: string;
  /** Name written to the case log for store changes made by the chat. */
  who?: string;
  title?: string;
  className?: string;
}

type Part = UIMessage["parts"][number];

const UI_ACTION_PARTS = new Set(["data-ui_actions", "data-ui_action", "data-actions"]);

/** UI actions carried by one message part: a data-ui_actions part, or a tool output with ui_actions. */
function actionsOfPart(part: Part): UiAction[] | null {
  if (UI_ACTION_PARTS.has(part.type)) return parseUiActions((part as { data?: unknown }).data);
  if (isToolUIPart(part) && part.state === "output-available") {
    const out = part.output as { ui_actions?: unknown } | null | undefined;
    return out && typeof out === "object" && "ui_actions" in out ? parseUiActions(out.ui_actions) : null;
  }
  return null;
}

function partKey(m: UIMessage, part: Part, i: number) {
  if (isToolUIPart(part)) return `${m.id}:tool:${part.toolCallId}`;
  return `${m.id}:${part.type}:${(part as { id?: string }).id ?? i}`;
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
  workflowStep,
  buyerInputs,
  demo: demoProp,
  api = "/api/chat",
  who = "Assistant",
  title = "Ask about suppliers",
  className,
}: ChatPanelProps) {
  const sourcingCase = useCases((s) => s.cases[caseId]);
  const [demoState, setDemoState] = useState(DEMO_DEFAULT);
  const demo = demoProp ?? demoState;
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const selected = selectedSupplier !== undefined ? selectedSupplier : selectedState;

  const workflow = useMemo(
    () => buildWorkflowContext(sourcingCase, { caseId, selectedSupplier: selected, workflowStep, buyerInputs }),
    [sourcingCase, caseId, selected, workflowStep, buyerInputs],
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
  const send = useCallback(
    (text: string) => {
      const t = text.trim();
      if (!t || busy) return;
      void sendMessage({ text: t }, { body: { workflow } });
    },
    [busy, sendMessage, workflow],
  );

  const onRendererAction = useCallback(
    (e: ActionEvent) => {
      if (e.type === "continue_conversation") send(e.humanFriendlyMessage || String(e.params.message ?? ""));
      else if (e.type === "open_url" && typeof e.params.url === "string" && /^https?:\/\//.test(e.params.url)) window.open(e.params.url, "_blank", "noopener,noreferrer");
      else parseUiActions({ type: e.type, ...e.params }).forEach(handleAction);
    },
    [send, handleAction],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  const chips = suggestions?.length ? suggestions : demo ? DEMO_SUGGESTIONS : [];
  const routeMissing = !!error && /501|not implemented|404|Failed to fetch/i.test(error.message);
  const shortlistCount = workflow.shortlist.length;

  return (
    <BlockEnvProvider caseId={caseId} who={who} dispatch={handleAction} ask={send}>
      <section data-chat-panel className={cn("flex h-full min-h-0 flex-col bg-canvas text-sm text-ink", className)}>
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold">{title}</h2>
            <p className="truncate text-xs text-subtext">
              {workflow.buyer_inputs.category ?? caseId} · {workflow.workflow_step.replace("_", " ")} · profile {workflow.profile_id}
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

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-10 text-center">
              <p className="text-md font-semibold">What do you need to know about your suppliers?</p>
              <p className="text-sm text-subtext">
                Answers come from the supplier dataset{demo ? " (demo: canned answers on fixture data)" : ""}. Blocks fetch their numbers directly, so what you see is what the data says.
              </p>
            </div>
          ) : (
            <ol className="flex flex-col gap-5">
              {messages.map((m, mi) => {
                const last = mi === messages.length - 1;
                if (m.role === "user")
                  return (
                    <li key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-xl bg-sunken px-3 py-2 text-sm text-ink">
                        {m.parts.map((p) => (p.type === "text" ? p.text : "")).join("")}
                      </div>
                    </li>
                  );
                return (
                  <li key={m.id} className="flex min-w-0 flex-col gap-2">
                    {m.parts.map((p, i) => {
                      if (p.type === "text") {
                        const streaming = last && status === "streaming" && p.state !== "done";
                        return <AssistantText key={i} text={p.text} isStreaming={streaming} onAction={onRendererAction} />;
                      }
                      if (isToolUIPart(p)) return <ToolChip key={i} part={p} />;
                      const acts = actionsOfPart(p);
                      return acts?.length ? <Receipt key={i} actions={acts} /> : null;
                    })}
                    {m.parts
                      .filter(isToolUIPart)
                      .map((p) => actionsOfPart(p))
                      .filter((a): a is UiAction[] => !!a?.length)
                      .map((a, i) => (
                        <Receipt key={`t${i}`} actions={a} />
                      ))}
                  </li>
                );
              })}
            </ol>
          )}
          {status === "submitted" && (
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
                      void regenerate({ body: { workflow } });
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

        <div className="border-t border-line px-4 pb-4 pt-3">
          {chips.length > 0 && !busy && (
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {chips.map((s) => (
                <Button key={s} size="sm" variant="secondary" pill className="h-7 shrink-0 px-2.5 text-xs" onClick={() => send(s)}>
                  {s}
                </Button>
              ))}
            </div>
          )}
          <Composer
            placeholder={busy ? "Answering…" : "Ask about suppliers, risks, alternatives"}
            disabled={busy}
            onSubmit={send}
            showMic={false}
            leadingAction={<span />}
            pills={
              <>
                <Badge size="sm" tone="outline">
                  {workflow.workflow_step.replace("_", " ")}
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
        </div>
      </section>
    </BlockEnvProvider>
  );
}
