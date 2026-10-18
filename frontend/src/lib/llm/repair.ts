import { InvalidToolInputError, streamText, type LanguageModel, type ModelMessage, type ToolCallRepairFunction, type ToolSet } from "ai";
import { CALL_SETTINGS } from "./provider";

/**
 * One retry on invalid tool input: re-ask the same model, forced to the same tool, with the
 * validation error appended. Unknown tool names are not repaired (the model sees the error next step).
 * Streams, because non-streaming calls can time out on the free tier.
 */
export function repairOnce(model: LanguageModel, schemaOnlyTools: ToolSet): ToolCallRepairFunction<ToolSet> {
  const repaired = new Set<string>();
  return async ({ toolCall, error, messages, instructions, abortSignal }) => {
    if (!InvalidToolInputError.isInstance(error) || repaired.has(toolCall.toolCallId)) return null;
    repaired.add(toolCall.toolCallId);
    const retryMessages: ModelMessage[] = [
      ...messages,
      {
        role: "user",
        content:
          `Your call to ${toolCall.toolName} had invalid input ${toolCall.input}. Validation error: ${error.message.slice(0, 600)}. ` +
          `Call ${toolCall.toolName} again with input that matches its schema exactly.`,
      },
    ];
    try {
      const retry = streamText({
        model,
        instructions,
        messages: retryMessages,
        tools: schemaOnlyTools,
        toolChoice: { type: "tool", toolName: toolCall.toolName },
        abortSignal,
        ...CALL_SETTINGS,
      });
      const calls = await retry.toolCalls;
      const fixed = calls.find((c) => c.toolName === toolCall.toolName);
      return fixed ? { ...toolCall, input: JSON.stringify(fixed.input) } : null;
    } catch {
      return null;
    }
  };
}
