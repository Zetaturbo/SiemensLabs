import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, streamText, toUIMessageStream } from "ai";
import { chatSetup, MAX_STEPS, parseWorkflow } from "@/lib/llm/chat";
import { buildAnswerPart } from "@/lib/llm/check-answer";
import type { ChatRequestBody, ChatUIMessage } from "@/lib/llm/protocol";
import { MODEL_ID, hasLlmKey } from "@/lib/llm/provider";
import { skills } from "@/skills/registry";
import type { SkillToolOutput } from "@/skills/types";

/**
 * POST /api/chat  body { messages: UIMessage[], workflow: WorkflowContext }
 * Streams an AI SDK UI message stream (SSE) that useChat consumes. Besides text and tool parts it carries:
 *   data-ui-actions  { tool_call_id, skill, actions: UiAction[] }   one per skill that requested UI changes
 *   data-answer      { prose, openui, source, issues }              once, at the end: what to render
 * Types: src/lib/llm/protocol.ts. See frontend/README.md "Chat protocol".
 */
export const maxDuration = 300;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<ChatRequestBody> | null;
  if (!body || !Array.isArray(body.messages)) return Response.json({ error: "body must be { messages, workflow }" }, { status: 400 });
  if (!hasLlmKey()) return Response.json({ error: "LLM_API_KEY is not set" }, { status: 503 });

  const messages = body.messages;
  const workflow = parseWorkflow(body.workflow);
  const outputs: SkillToolOutput[] = [];

  const stream = createUIMessageStream<ChatUIMessage>({
    originalMessages: messages,
    onError: (e) => (e instanceof Error ? e.message : "The assistant failed. Please try again."),
    execute: async ({ writer }) => {
      const setup = await chatSetup({
        workflow,
        onOutput: (output, toolCallId) => {
          outputs.push(output);
          if (output.ui_actions.length) {
            writer.write({
              type: "data-ui-actions",
              id: `ui-${toolCallId}`,
              data: { tool_call_id: toolCallId, skill: output.skill, actions: output.ui_actions },
            });
          }
        },
      });
      const result = streamText({
        ...setup,
        messages: await convertToModelMessages(messages, { tools: setup.tools, ignoreIncompleteToolCalls: true }),
        abortSignal: req.signal,
      });
      writer.merge(
        toUIMessageStream({
          stream: result.stream,
          tools: setup.tools,
          sendReasoning: false, // Nemotron streams reasoning_content; never show it as answer text
          sendFinish: false,
          messageMetadata: ({ part }) => (part.type === "start" ? { model: MODEL_ID } : undefined),
        }),
      );
      const steps = await result.steps;
      const finalText = steps.at(-1)?.text ?? "";
      writer.write({ type: "data-answer", id: "answer", data: buildAnswerPart(finalText, outputs) });
      const finishReason = await result.finishReason;
      writer.write({ type: "finish", finishReason, messageMetadata: { model: MODEL_ID, finish_reason: finishReason, steps: steps.length } });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

/** GET /api/chat: skill catalog for suggestion chips (client components cannot import the server-only registry). */
export async function GET() {
  return Response.json({
    model: MODEL_ID,
    max_steps: MAX_STEPS,
    skills: skills.map((s) => ({ name: s.name, description: s.description, priority: s.priority, stage: s.stage, examples: s.examples })),
  });
}
