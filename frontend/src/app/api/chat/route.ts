/**
 * Chat route (workstream A core). Plan:
 *  1. Parse { messages, workflow } from the body (workflow = WorkflowContext from src/skills/types).
 *  2. Build the system prompt: dimension metadata from get_metadata, level bands, families,
 *     worked examples from the skill registry, plus openUiPromptSection().
 *  3. streamText from the `ai` package with chatModel() and the skills as tools
 *     (input = skill.input, execute = skill.run with ctx.putResult), temperature 0, max 3 steps.
 *  4. The model's final text is OpenUI Lang; the client renders it with <Renderer>.
 * Verify the ai@7 streamText/tool API in node_modules/ai before writing step 3.
 */
export async function POST() {
  return Response.json({ error: "chat route not implemented yet" }, { status: 501 });
}
