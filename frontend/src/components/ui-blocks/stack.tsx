"use client";
import type { ComponentRenderer } from "@openuidev/react-lang";

/** Layout root: renders its child element nodes top to bottom through renderNode. */
export const StackBlock: ComponentRenderer<{ children?: unknown[]; title?: string | null }> = ({ props, renderNode }) => (
  <div data-block="stack" className="flex w-full min-w-0 flex-col gap-4">
    {props.title && <h2 className="text-base font-semibold text-ink">{props.title}</h2>}
    {renderNode(props.children ?? [])}
  </div>
);
