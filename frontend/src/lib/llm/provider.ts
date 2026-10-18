import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/**
 * One switch for the demo platform. Nebius Token Factory by default;
 * point LLM_BASE_URL at build.nvidia.com and change LLM_MODEL for the fallback.
 * Verify the exact model ids with GET {LLM_BASE_URL}/models?verbose=true.
 */
export const llmProvider = createOpenAICompatible({
  name: "demo-llm",
  baseURL: process.env.LLM_BASE_URL ?? "https://api.tokenfactory.nebius.com/v1",
  apiKey: process.env.LLM_API_KEY,
});

export const MODEL_ID = process.env.LLM_MODEL ?? "zai-org/GLM-5.3";
export const chatModel = () => llmProvider(MODEL_ID);
