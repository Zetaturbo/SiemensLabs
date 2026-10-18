"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";
import { Alert } from "@/design-system/react";
import { Markdown } from "./markdown";
import type { BlockProps } from "./specs";

export function TextView({ content, tone }: { content: string; tone?: string | null }) {
  if (tone === "warning")
    return (
      <Alert data-block="text" tone="warning" className="p-2.5">
        <Markdown text={content} className="space-y-1.5 text-sm text-ink" />
      </Alert>
    );
  return (
    <div data-block="text" className={tone === "muted" ? "text-subtext" : "text-ink"}>
      <Markdown text={content} className="space-y-1.5 text-sm leading-relaxed" />
    </div>
  );
}

export const TextBlock: ComponentRenderer<BlockProps<"Text">> = ({ props }) => <TextView content={props.content ?? ""} tone={props.tone} />;
