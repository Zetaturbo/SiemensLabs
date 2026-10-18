import { z } from "zod/v4";
import { defineSkill } from "./types";
import { RESEARCH_LINKS, SUPPLIER_NAMES } from "@/lib/cases/seed";
import { ResearchError, refusedJobState, researchMode, startResearch, trackResearchJob } from "@/lib/research/client";
import { isReplayCompany } from "@/lib/research/replay";
import type { ResearchJobState } from "@/lib/research/types";

interface ResearchStarted {
  /** Empty when the start was refused. */
  job_id: string;
  company_name: string;
  mode: "live" | "replay";
  supplier_id?: string;
  /** Set when the dataset supplier was researched as its linked company. */
  linked_from?: string;
  refused?: { code: string; message: string };
  handle: string;
}

const DATASET_ID = /\b(?:SUPP|BRK)_\d+\b/i;
const NAME_TO_ID = new Map(Object.entries(SUPPLIER_NAMES).map(([id, name]) => [name.toLowerCase(), id]));
/** Portfolio dataset names are "<Word> <Word> <number>" (Advanced Industries 539); real company names are not. */
const SYNTHETIC_NAME = /^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,4}$/;
const firstSentence = (s: string) => s.match(/^.*?[.!?](?=\s|$)/)?.[0] ?? s;
const sameCompany = (a: string, b: string) => {
  const first = (s: string) => s.toLowerCase().split(/[\s,-]+/)[0] ?? "";
  return !!a && first(a) === first(b);
};

/**
 * Which company to research: a dataset supplier (by supplier_id, an id in the name, or its invented dataset name)
 * is researched as its linked real company (RESEARCH_LINKS in src/lib/cases/seed.ts); without a link its id is sent,
 * so the service refuses it (SYNTHETIC_ENTITY). Any other name is researched as given.
 */
function resolveTarget(input: { company_name: string; supplier_id?: string; country?: string; website?: string }) {
  const name = input.company_name.trim();
  const id = input.supplier_id?.trim().toUpperCase() || name.match(DATASET_ID)?.[0]?.toUpperCase() || NAME_TO_ID.get(name.toLowerCase());
  // The name stands for the dataset supplier: its id, its dataset name, or an invented portfolio name ("Apex Technologies 491").
  const isDatasetName = DATASET_ID.test(name) || NAME_TO_ID.has(name.toLowerCase()) || (!!id && SYNTHETIC_NAME.test(name));
  const link = id ? RESEARCH_LINKS[id] : undefined;
  if (link && (isDatasetName || sameCompany(name, link.legal_name)))
    return { company_name: link.legal_name, country: link.country ?? input.country, website: link.website ?? input.website, supplier_id: id, linked_from: id };
  if (isDatasetName && id) return { company_name: id, country: input.country, website: input.website, supplier_id: id };
  // A real name, possibly given alongside a supplier id: research the name, keep the id on the job.
  return { company_name: name, country: input.country, website: input.website, supplier_id: id };
}

export const researchCompany = defineSkill({
  name: "research_company",
  description:
    "Starts a web research job on a REAL company (news, registers, court and antitrust records, sanctions lists, safety investigations, patents) and returns a job id; " +
    "the report with verified, source-linked risk flags streams into the research panel over the next minute. Use when the buyer names a real company " +
    "(e.g. Knorr-Bremse, Wabtec, Akebono) or asks to research, check, vet or screen a dataset supplier: pass its id as supplier_id and its name as company_name. " +
    "A dataset supplier (SUPP_/BRK_ id, invented name) is researched as its linked real company when it has one; without a link the research service refuses it. " +
    "For the dataset's own scores use explain_supplier. Renders a live risk flag list.",
  priority: "core",
  stage: "finalists",
  input: z.object({
    company_name: z.string().min(2).describe("Legal or common name of a real company, or the dataset supplier's name or id"),
    country: z.string().optional().describe("ISO country code if the buyer gave one"),
    website: z.string().optional(),
    focus: z.array(z.enum(["financial", "legal", "sanctions", "esg", "operations"])).optional(),
    supplier_id: z.string().optional().describe("Dataset supplier (SUPP_/BRK_ id) the buyer asked about or this company is linked to"),
    auto_confirm: z
      .boolean()
      .optional()
      .describe("Default true: when several registry entities match, research the best match. false = let the buyer pick from candidates"),
  }),
  run: async (input, ctx): Promise<ResearchStarted> => {
    const target = resolveTarget(input);
    const base = { company_name: target.company_name, mode: researchMode(), supplier_id: target.supplier_id, linked_from: target.linked_from };
    try {
      const { job_id } = await startResearch({
        company_name: target.company_name,
        country: target.country ?? null,
        website: target.website ?? null,
        supplier_id: target.supplier_id ?? null,
        auto_confirm: input.auto_confirm ?? true,
        focus: input.focus,
      });
      const state: ResearchJobState = trackResearchJob(job_id, target.company_name, target.supplier_id);
      const handle = ctx.putResult(state); // live object: the tracker mutates it in place
      return { ...base, job_id, handle };
    } catch (e) {
      if (!(e instanceof ResearchError)) throw e;
      const state = refusedJobState(target.company_name, e, target.supplier_id);
      // The refusal shows as one sentence: the service's own first sentence for a dataset supplier.
      if (e.code === "SYNTHETIC_ENTITY") state.error = firstSentence(e.message);
      return { ...base, job_id: "", refused: { code: e.code, message: state.error ?? e.message }, handle: ctx.putResult(state) };
    }
  },
  summarize: (r) => {
    if (r.refused?.code === "SYNTHETIC_ENTITY")
      return `Research not started: ${r.refused.message} It has no linked real company; tell the buyer in one sentence and offer explain_supplier for its dataset scores.`;
    if (r.refused) return `Research for ${r.company_name} could not start (${r.refused.code}): ${r.refused.message}`;
    const linked = r.linked_from ? ` (the real company linked to ${r.linked_from})` : "";
    if (r.mode === "replay" && !isReplayCompany(r.company_name))
      return `Research service is not connected (replay mode only has the recorded Knorr-Bremse run), so the job for ${r.company_name}${linked} will fail. Tell the buyer research for this company needs the live research service.`;
    return (
      `Started research job ${r.job_id} for ${r.company_name}${linked}${r.mode === "replay" ? " (replay of a recorded live run)" : ""}. ` +
      "Progress and verified, sourced risk flags appear in the research panel; the report is not available yet, so do not state findings."
    );
  },
  view: (_r, handle) => `root = RiskFlagList("${handle}")`,
  uiActions: (r) => (r.job_id ? [{ type: "start_research", job_id: r.job_id, company_name: r.company_name, result_id: r.handle, supplier_id: r.supplier_id }] : []),
  examples: ["Research Knorr-Bremse", "Check Knorr-Bremse for sanctions and legal issues", "Research this supplier"],
  workedExamples: [
    { question: "Research Knorr-Bremse", input: { company_name: "Knorr-Bremse" } },
    { question: "Research SUPP_09772", input: { company_name: "SUPP_09772", supplier_id: "SUPP_09772" } },
  ],
});

