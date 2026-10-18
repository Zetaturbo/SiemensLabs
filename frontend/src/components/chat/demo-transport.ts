import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { primeResults } from "@/lib/hooks/use-result";
import type { UiAction } from "./ui-actions";

/**
 * Demo mode: a ChatTransport that never calls /api/chat. It picks a canned scenario from the
 * last user message, primes the fixture results into the useResult cache, and streams the same
 * chunk types the real route emits (tool call parts, a data-ui_actions part, OpenUI Lang text),
 * so the panel, the blocks and ui_actions all run without a backend or LLM key.
 */

interface ToolStep {
  tool: string;
  input: Record<string, unknown>;
  handle?: string;
  summary: string;
}

interface Scenario {
  id: string;
  match: RegExp;
  tools: ToolStep[];
  actions?: UiAction[];
  /** OpenUI Lang (or prose) the model would answer with. */
  text: string;
}

// Handles match FIXTURE_IDS in src/components/ui-blocks/fixtures.ts.
const SCENARIOS: Scenario[] = [
  {
    id: "out_of_scope",
    match: /\b(price|cost|cheap|quote|country|region|located)\b/i,
    tools: [],
    text: `root = Text("The dataset has **no price, country or region**, so I cannot rank on them. Add quotes to the case to weigh cost against risk, or ask about delivery rating and sourcing risk instead.", "warning")`,
  },
  {
    id: "research",
    match: /\b(research|news|web|recall|lawsuit|sanction)/i,
    tools: [{ tool: "research_company", input: { company_name: "Example Rail Components GmbH", country: "DE", depth: "standard" }, handle: "demo_research_report", summary: "Report ready: overall elevated, 3 flags (1 high: product recall 2025-03-14)." }],
    text: `root = Stack([intro, flags, sources])
intro = Text("Web research on the linked legal entity found **3 flags**; the product recall is the one to follow up. (Demo data: fictional company.)")
flags = RiskFlagList("demo_research_report")
sources = SourceList("demo_research_report")`,
  },
  {
    id: "memo",
    match: /\b(memo|justif|write.?up|document|summar)/i,
    tools: [{ tool: "shortlist_memo", input: { case_id: "case_doors" }, handle: "demo_shortlist_memo", summary: "Memo drafted for 3 shortlisted suppliers; recommendation SUPP_00012." }],
    text: `root = Memo("demo_shortlist_memo")`,
  },
  {
    id: "compare",
    match: /\b(compare|comparison|versus|vs\.?|which (one |of these |supplier )?is (the )?best|side by side)\b/i,
    tools: [{ tool: "compare_suppliers", input: { ids: ["SUPP_00012", "SUPP_00450", "SUPP_00731"], profile_id: "default" }, handle: "demo_compare_suppliers", summary: "3 suppliers compared; largest differences: operational_resilience, labor_stability, environmental_exposure." }],
    actions: [{ type: "open_compare", ids: ["SUPP_00012", "SUPP_00450", "SUPP_00731"] }],
    text: `root = Stack([intro, verdict, grid, radar])
intro = Text("All three are **High** on the total risk index. On financial risk one of them stands out:")
verdict = Verdict("demo_compare_suppliers", "financial")
grid = CompareGrid("demo_compare_suppliers")
radar = RadarProfile("demo_compare_suppliers")`,
  },
  {
    id: "explain",
    match: /\b(why|explain|driver|breakdown|score)\b/i,
    tools: [{ tool: "explain_supplier", input: { id: "SUPP_00018", profile_id: "default" }, handle: "demo_explain_supplier", summary: "SUPP_00018: TRI 80 (Critical), riskier than 98.31%; top driver operational_resilience +4.5 vs mean." }],
    text: `root = Stack([card, why])
card = SupplierCard("demo_explain_supplier")
why = ContributionWaterfall("demo_explain_supplier")`,
  },
  {
    id: "similar",
    match: /\b(similar|alternative|replace|instead|like supp)/i,
    tools: [{ tool: "find_similar", input: { id: "SUPP_00450", must_be_lower: ["geopolitical_risk", "environmental_exposure"], limit: 5 }, handle: "demo_find_similar", summary: "5 similar suppliers with lower geopolitical and environmental risk; nearest SUPP_08966 (distance 40.24)." }],
    text: `root = Stack([intro, list])
intro = Text("Closest profiles to SUPP_00450 that are lower on geopolitical risk and environmental exposure:")
list = RankedList("demo_find_similar")`,
  },
  {
    id: "rank",
    match: /\b(rank|profile|weight|safety.?critical|brake)/i,
    tools: [{ tool: "rank_with_profile", input: { profile_id: "safety_critical", limit: 20 }, handle: "demo_rank_with_profile", summary: "Ranked 5,904 candidates with safety_critical; top SUPP_00609 (profile score 0.45)." }],
    actions: [{ type: "set_profile", profile_id: "safety_critical" }],
    text: `root = Stack([intro, list])
intro = Text("Same requirements, ranked with the **safety-critical** profile. Arrows show how far each supplier moved against the default ranking.")
list = RankedList("demo_rank_with_profile", null, 8)`,
  },
  {
    id: "sql",
    match: /\b(how many|count|distribution|per level|sql|breakdown by)\b/i,
    tools: [{ tool: "run_sql", input: { query: "SELECT total_risk_index_level AS level, COUNT(*) AS n FROM suppliers GROUP BY level ORDER BY n DESC, level" }, handle: "demo_run_sql", summary: "4 rows: High 4813, Medium 4485, Critical 384, Low 318." }],
    text: `root = Table("demo_run_sql", "Suppliers per total risk level")`,
  },
  {
    id: "pin",
    match: /\b(add|pin|put)\b.*\b(shortlist|list)\b/i,
    tools: [{ tool: "filter_suppliers", input: { conditions: [{ field: "quality_risk_level", op: "ne", value: "Critical" }, { field: "delivery_rating", op: "gte", value: 90 }], limit: 20 }, handle: "demo_filter_suppliers", summary: "5904 suppliers match; showing 20. Top ids: SUPP_00609, SUPP_03267, SUPP_03469." }],
    actions: [{ type: "add_to_shortlist", ids: ["SUPP_00609", "SUPP_03267", "SUPP_03469"] }],
    text: `root = Stack([intro, list])
intro = Text("Added the **three lowest-risk** suppliers to your shortlist.")
list = RankedList("demo_filter_suppliers", null, 5)`,
  },
  {
    id: "filter",
    match: /.*/,
    tools: [
      {
        tool: "filter_suppliers",
        input: { conditions: [{ field: "quality_risk_level", op: "ne", value: "Critical" }, { field: "delivery_rating", op: "gte", value: 90 }], sort_by: [{ field: "total_risk_index", order: "asc" }], limit: 20 },
        handle: "demo_filter_suppliers",
        summary: "5904 suppliers match; showing 20. Top ids: SUPP_00609, SUPP_03267, SUPP_03469.",
      },
    ],
    text: `root = Stack([intro, list])
intro = Text("**5,904 suppliers** have no Critical quality score and a delivery rating of at least 90%. The lowest total risk first:")
list = RankedList("demo_filter_suppliers")`,
  },
];

/** Prompts that hit each scenario, for suggestion chips in demo mode. */
export const DEMO_SUGGESTIONS = [
  "Show me low-risk suppliers with delivery rating above 90",
  "Rank them with the safety-critical profile",
  "Compare SUPP_00012, SUPP_00450 and SUPP_00731",
  "Why is SUPP_00018 rated Critical?",
  "Find alternatives to SUPP_00450 with lower geopolitical risk",
  "Add the top 3 to my shortlist",
  "How many suppliers are there per risk level?",
  "Research Example Rail Components GmbH",
  "Write the shortlist memo",
  "Which one is cheapest?",
];

const lastUserText = (messages: UIMessage[]) => {
  const m = [...messages].reverse().find((x) => x.role === "user");
  return m?.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ") ?? "";
};

export function pickScenario(text: string): Scenario {
  return SCENARIOS.find((s) => s.match.test(text)) ?? SCENARIOS[SCENARIOS.length - 1];
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

let primed: Promise<void> | null = null;
/** Fixtures load lazily so they stay out of the main chat bundle. */
export function primeDemoFixtures() {
  primed ??= import("@/components/ui-blocks/fixtures").then((m) => primeResults(m.FIXTURES));
  return primed;
}

export function createDemoTransport({ speed = 1 }: { speed?: number } = {}): ChatTransport<UIMessage> {
  return {
    async sendMessages({ messages, abortSignal }) {
      const scenario = pickScenario(lastUserText(messages));
      await primeDemoFixtures();
      const wait = (ms: number) => sleep(ms / speed, abortSignal);
      return new ReadableStream<UIMessageChunk>({
        async start(controller) {
          const emit = (c: UIMessageChunk) => controller.enqueue(c);
          try {
            emit({ type: "start" });
            await wait(250);
            for (const [i, t] of scenario.tools.entries()) {
              const toolCallId = `demo_${scenario.id}_${i}_${Date.now().toString(36)}`;
              emit({ type: "start-step" });
              emit({ type: "tool-input-start", toolCallId, toolName: t.tool, dynamic: true });
              emit({ type: "tool-input-available", toolCallId, toolName: t.tool, input: t.input, dynamic: true });
              await wait(700);
              emit({ type: "tool-output-available", toolCallId, output: { handle: t.handle, summary: t.summary }, dynamic: true });
              emit({ type: "finish-step" });
            }
            emit({ type: "start-step" });
            if (scenario.actions?.length) emit({ type: "data-ui_actions", data: { ui_actions: scenario.actions } });
            const id = `text_${scenario.id}`;
            emit({ type: "text-start", id });
            for (let k = 0; k < scenario.text.length; k += 14) {
              emit({ type: "text-delta", id, delta: scenario.text.slice(k, k + 14) });
              await wait(28);
            }
            emit({ type: "text-end", id });
            emit({ type: "finish-step" });
            emit({ type: "finish", finishReason: "stop" });
            controller.close();
          } catch (e) {
            if ((e as Error)?.name === "AbortError") controller.close();
            else controller.error(e);
          }
        },
      });
    },
    async reconnectToStream() {
      return null;
    },
  };
}
