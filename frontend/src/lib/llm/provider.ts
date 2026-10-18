import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * One switch for the demo platform: any OpenAI-compatible endpoint.
 * Default: NVIDIA build.nvidia.com with Nemotron 3 Super (fast first token, reliable tool calls in our tests).
 * Nebius Token Factory: LLM_BASE_URL=https://api.tokenfactory.nebius.com/v1 and a Nebius model id.
 * Verify model ids with GET {LLM_BASE_URL}/models.
 */
export const LLM_BASE_URL = process.env.LLM_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
export const MODEL_ID = process.env.LLM_MODEL ?? "nvidia/nemotron-3-super-120b-a12b";

export const llmProvider = createOpenAICompatible({
  name: "demo-llm",
  baseURL: LLM_BASE_URL,
  apiKey: process.env.LLM_API_KEY,
});

export const hasLlmKey = () => Boolean(process.env.LLM_API_KEY);

/** Chat model; pass an id to override LLM_MODEL (the routing eval compares models this way). */
export const chatModel = (modelId: string = MODEL_ID) => llmProvider(modelId);

/**
 * Reasoning ("thinking") is off by default: on Nemotron it adds about 5 s before the first answer token.
 * LLM_REASONING=on re-enables it. Sent as chat_template_kwargs, which NIM/vLLM-style endpoints pass to
 * the model's chat template.
 */
export const REASONING = (process.env.LLM_REASONING ?? "off").toLowerCase() === "on";

/** Shared call settings: deterministic, generous timeouts (free-tier endpoints can queue for a while). */
export const CALL_SETTINGS = {
  temperature: 0,
  maxRetries: 1,
  timeout: { totalMs: 180_000, firstChunkMs: 90_000 },
  ...(REASONING ? {} : { providerOptions: { demoLlm: { chat_template_kwargs: { enable_thinking: false } } } }),
};
