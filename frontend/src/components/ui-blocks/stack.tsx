"use client";
import { defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { CompareGrid } from "./compare-grid";
import { ContributionWaterfall } from "./contribution-waterfall";
import { Memo } from "./memo";
import { RadarProfile } from "./radar-profile";
import { RankedList } from "./ranked-list";
import { RiskFlagList } from "./risk-flag-list";
import { SourceList } from "./source-list";
import { SupplierCard } from "./supplier-card";
import { Table } from "./table";
import { Text } from "./text";
import { Verdict } from "./verdict";

/** Every block a Stack may hold. Stacks do not nest. */
const child = z.union([
  Text.ref,
  RankedList.ref,
  CompareGrid.ref,
  Verdict.ref,
  ContributionWaterfall.ref,
  RadarProfile.ref,
  SupplierCard.ref,
  Memo.ref,
  RiskFlagList.ref,
  SourceList.ref,
  Table.ref,
]);

export const Stack = defineComponent({
  name: "Stack",
  description: "Layout root: renders its children top to bottom. Use it whenever the answer has more than one block; put a short Text first when narration helps.",
  props: z.object({
    children: z.array(child).describe("Blocks in reading order"),
    title: z.string().optional().describe("Optional heading above the blocks"),
  }),
  component: ({ props, renderNode }) => (
    <div data-block="stack" className="flex w-full min-w-0 flex-col gap-3">
      {props.title && <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{props.title}</h2>}
      {renderNode(props.children)}
    </div>
  ),
});
