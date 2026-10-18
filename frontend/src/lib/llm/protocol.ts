/**
 * Chat protocol types shared by POST /api/chat and the chat panel (client-safe, types only).
 * See frontend/README.md "Chat protocol".
 */
import type { UIMessage } from "ai";
import type { UiAction, WorkflowContext, SkillToolOutput } from "@/skills/types";
import type { AnswerPart } from "./answer";

export type { UiAction, WorkflowContext, SkillToolOutput, AnswerPart };

export type ChatDataParts = {
  /** One per skill that requested UI changes; apply in onData. */
  "ui-actions": { tool_call_id: string; skill: string; actions: UiAction[] };
  /** Once per turn, last: what to render. */
  answer: AnswerPart;
};

export type ChatMessageMetadata = { model?: string; finish_reason?: string; steps?: number };

export type ChatUIMessage = UIMessage<ChatMessageMetadata, ChatDataParts>;

/** Request body of POST /api/chat. */
export interface ChatRequestBody {
  messages: ChatUIMessage[];
  workflow: WorkflowContext;
}
