import { streamText } from "ai";
import { CALL_SETTINGS, chatModel, hasLlmKey } from "./provider";

/**
 * Prose generation for the one skill that writes text (shortlist_memo).
 * Streams (non-streaming calls with long prompts time out on the free tier) and returns the
 * full text, or null when no key is configured or the call fails, so the caller can fall back.
 */
export async function writeProse(opts: { instructions: string; prompt: string; abortSignal?: AbortSignal }): Promise<string | null> {
  if (!hasLlmKey()) return null;
  try {
    const result = streamText({
      model: chatModel(),
      instructions: opts.instructions,
      prompt: opts.prompt,
      abortSignal: opts.abortSignal,
      ...CALL_SETTINGS,
    });
    let text = "";
    for await (const delta of result.textStream) text += delta;
    return text.trim() || null;
  } catch (e) {
    console.error("[writeProse] failed:", e instanceof Error ? e.message : e);
    return null;
  }
}
