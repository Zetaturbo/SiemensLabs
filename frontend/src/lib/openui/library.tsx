import { createLibrary, defineComponent, type PromptOptions } from "@openuidev/lang-core";
import type { ComponentRenderer, Library } from "@openuidev/react-lang";
import { z } from "zod/v4";
import { specs, STACK_DESCRIPTION } from "@/components/ui-blocks/specs";
import { normalizeOpenUi } from "./normalize";
import {
  CompareGridBlock,
  ContributionWaterfallBlock,
  GuidanceBlock,
  MemoBlock,
  OfferingTableBlock,
  RadarProfileBlock,
  RankedListBlock,
  RfqBoardBlock,
  RiskFlagListBlock,
  SourceListBlock,
  StackBlock,
  SupplierCardBlock,
  TableBlock,
  TextBlock,
  VerdictBlock,
} from "@/components/ui-blocks";

/**
 * OpenUI component library: the trusted UI blocks the model composes.
 * Each block receives a resultId and fetches its full payload from /api/results/:id,
 * so the model never types numbers.
 *
 * Safe to import from the chat route (React Server layer): it uses @openuidev/lang-core,
 * not @openuidev/react-lang (which calls createContext at import time), and the renderers
 * come from "use client" modules, so on the server they are opaque client references.
 * Schemas live in src/components/ui-blocks/specs.ts, renderers in the block files.
 */
export const Text = defineComponent({ ...specs.Text, component: TextBlock });
export const RankedList = defineComponent({ ...specs.RankedList, component: RankedListBlock });
export const CompareGrid = defineComponent({ ...specs.CompareGrid, component: CompareGridBlock });
export const Verdict = defineComponent({ ...specs.Verdict, component: VerdictBlock });
export const ContributionWaterfall = defineComponent({ ...specs.ContributionWaterfall, component: ContributionWaterfallBlock });
export const RadarProfile = defineComponent({ ...specs.RadarProfile, component: RadarProfileBlock });
export const SupplierCard = defineComponent({ ...specs.SupplierCard, component: SupplierCardBlock });
export const Memo = defineComponent({ ...specs.Memo, component: MemoBlock });
export const RiskFlagList = defineComponent({ ...specs.RiskFlagList, component: RiskFlagListBlock });
export const SourceList = defineComponent({ ...specs.SourceList, component: SourceListBlock });
export const Table = defineComponent({ ...specs.Table, component: TableBlock });
export const Guidance = defineComponent({ ...specs.Guidance, component: GuidanceBlock });
export const OfferingTable = defineComponent({ ...specs.OfferingTable, component: OfferingTableBlock });
export const RfqBoard = defineComponent({ ...specs.RfqBoard, component: RfqBoardBlock });

const leaves = [Text, RankedList, CompareGrid, Verdict, ContributionWaterfall, RadarProfile, SupplierCard, Memo, RiskFlagList, SourceList, Table, Guidance, OfferingTable, RfqBoard];

export const Stack = defineComponent({
  name: "Stack",
  description: STACK_DESCRIPTION,
  props: z.object({
    children: z
      .array(
        z.union([
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
          Guidance.ref,
          OfferingTable.ref,
          RfqBoard.ref,
        ]),
      )
      .describe("Blocks in reading order"),
    title: z.string().optional().describe("Optional heading above the blocks"),
  }),
  component: StackBlock as ComponentRenderer<{ children: unknown[]; title?: string }>,
});

// ComponentRenderer<never> accepts every block renderer (props are contravariant); react-lang's Library type is what <Renderer> expects.
export const library: Library = createLibrary<ComponentRenderer<never>>({
  components: [Stack, ...leaves],
  root: "Stack",
  componentGroups: [
    { name: "Layout and narration", components: ["Stack", "Text"] },
    { name: "Guidance", components: ["Guidance"] },
    { name: "Supplier lists", components: ["RankedList", "Table"] },
    { name: "Comparison and decision", components: ["CompareGrid", "Verdict", "RadarProfile"] },
    { name: "One supplier", components: ["SupplierCard", "ContributionWaterfall"] },
    { name: "Research and documents", components: ["RiskFlagList", "SourceList", "Memo"] },
    { name: "Brake RFQ", components: ["OfferingTable", "RfqBoard"] },
  ],
}) as unknown as Library;

/** Positional parameter order per component, for the named-argument normalizer. */
export const COMPONENT_PARAMS: Record<string, string[]> = Object.fromEntries(
  [Stack, ...leaves].map((c) => [c.name, Object.keys((c.props as z.ZodObject).shape)]),
);

export const OPENUI_EXAMPLES = [
  `root = Stack([intro, list])
intro = Text("Suppliers meeting your requirements, lowest total risk first.")
list = RankedList("filter_1a2b3c4d")`,
  `root = Stack([grid, verdict, radar])
grid = CompareGrid("compare_1a2b3c4d")
verdict = Verdict("compare_1a2b3c4d", "financial")
radar = RadarProfile("compare_1a2b3c4d")`,
  `root = Stack([card, why])
card = SupplierCard("explain_1a2b3c4d")
why = ContributionWaterfall("explain_1a2b3c4d")`,
  `root = Stack([note, ranked])
note = Text("Price is not in the dataset, so this ranking covers risk only. Add quotes to weigh cost.", "warning")
ranked = RankedList("rank_1a2b3c4d", "Ranked with the safety-critical profile")`,
  `root = Stack([flags, sources])
flags = RiskFlagList("research_1a2b3c4d")
sources = SourceList("research_1a2b3c4d")`,
  `root = Memo("memo_1a2b3c4d")`,
  `root = Table("sql_1a2b3c4d", "Suppliers per risk level")`,
  `root = Guidance("what_1a2b3c4d")`,
];

export const OPENUI_RULES = [
  'Arguments are positional, in signature order: write CompareGrid("compare_1a2b3c4d"), never CompareGrid(resultId="compare_1a2b3c4d"). Skip an optional argument in the middle with null.',
  "Every resultId must be a handle a tool returned in this conversation. Never invent or alter one.",
  "Never type supplier scores, ranks or other data values into props; the blocks fetch them by resultId. Text may only repeat numbers that appeared in a tool summary.",
  "Use Stack as the root when the answer has more than one block. Start with one short Text when it helps; do not restate what the blocks show.",
  'When the data lacks what the buyer asked for (price, country, category), say so in a Text with tone "warning".',
  "Pick the block for the result: filter_suppliers, rank_with_profile, find_similar -> RankedList; compare_suppliers -> CompareGrid (+ Verdict, RadarProfile); explain_supplier -> SupplierCard + ContributionWaterfall; research report -> RiskFlagList + SourceList; shortlist_memo -> Memo; run_sql -> Table; what_matters -> Guidance; find_offerings -> OfferingTable; qualify_for_rfq -> RfqBoard.",
];

/** System prompt section for the chat route: OpenUI Lang syntax, the block signatures, rules and examples. */
export function openUiPromptSection(options: Pick<PromptOptions, "inlineMode" | "preamble" | "additionalRules" | "examples"> = {}): string {
  return library.prompt({
    preamble: options.preamble ?? "Answer with OpenUI Lang composed only of the components below. Reference results only by resultId.",
    additionalRules: [...OPENUI_RULES, ...(options.additionalRules ?? [])],
    examples: options.examples ?? OPENUI_EXAMPLES,
    inlineMode: options.inlineMode,
  });
}

/** Rewrites named arguments (`CompareGrid(resultId="x")`) to positional form for this library. */
export const normalizeResponse = (src: string) => normalizeOpenUi(src, COMPONENT_PARAMS);
