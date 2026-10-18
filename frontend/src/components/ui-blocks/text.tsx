"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { Markdown } from "./markdown";
import { cx } from "./primitives";

const TONE: Record<string, string> = {
  default: "text-zinc-800 dark:text-zinc-200",
  muted: "text-zinc-500 dark:text-zinc-400",
  warning: "rounded-md bg-amber-400/10 px-2.5 py-1.5 text-amber-900 dark:text-amber-200",
};

export function TextView({ content, tone }: { content: string; tone?: string | null }) {
  return (
    <div data-block="text" className={cx("text-sm leading-relaxed", TONE[tone ?? "default"] ?? TONE.default)}>
      <Markdown text={content} className="space-y-1.5" />
    </div>
  );
}

export const Text = defineComponent({
  name: "Text",
  description:
    "Short narration in light Markdown (bold, lists, links): one or two sentences that frame the blocks. " +
    "Only cite numbers that appeared in a tool summary; use tone \"warning\" for missing data (price, country, category).",
  props: z.object({
    content: z.string().describe("Markdown text"),
    tone: z.enum(["default", "muted", "warning"]).optional().describe("Visual tone"),
  }),
  component: ({ props }) => <TextView content={props.content ?? ""} tone={props.tone} />,
});
