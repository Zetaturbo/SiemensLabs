import { createLibrary, defineComponent } from "@openuidev/react-lang";
import { z } from "zod/v4";

/**
 * OpenUI component library: the trusted UI blocks skills compose.
 * Each block receives a resultId and fetches its full payload from /api/results/:id,
 * so the model never types numbers. Add blocks in src/components/ui-blocks and register here.
 */
export const Verdict = defineComponent({
  name: "Verdict",
  description: "Decision block: the winner, the deciding factor and caveats of a comparison.",
  props: z.object({
    resultId: z.string().describe("Handle of a compare_suppliers result"),
  }),
  component: ({ props }) => <div data-block="verdict">Verdict for {props.resultId} (todo)</div>,
});

export const RankedList = defineComponent({
  name: "RankedList",
  description: "Ranked suppliers with inline risk bars and pin-to-shortlist actions.",
  props: z.object({
    resultId: z.string().describe("Handle of a filter_suppliers or rank_with_profile result"),
  }),
  component: ({ props }) => <div data-block="ranked-list">RankedList for {props.resultId} (todo)</div>,
});

export const library = createLibrary({
  components: [Verdict, RankedList],
  root: "RankedList",
});

export const openUiPromptSection = () =>
  library.prompt({
    preamble: "Compose the answer from the registered components. Reference results only by resultId.",
    additionalRules: ["Never type supplier scores into props; components fetch them by resultId."],
    examples: [`root = RankedList(resultId="filter_1a2b3c4d")`],
  });
