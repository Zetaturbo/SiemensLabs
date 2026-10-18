import { z } from "zod/v4";
import { defineSkill } from "./types";
import { researchMode, startResearch, trackResearchJob } from "@/lib/research/client";
import { isReplayCompany } from "@/lib/research/replay";
import type { ResearchJobState } from "@/lib/research/types";

interface ResearchStarted {
  job_id: string;
  company_name: string;
  mode: "live" | "replay";
  supplier_id?: string;
  handle: string;
}

export const researchCompany = defineSkill({
  name: "research_company",
  description:
    "Starts a web research job on a REAL company (news, registers, court and antitrust records, sanctions lists, ESG) and returns a job id; " +
    "the report with sourced risk flags streams into the research panel over the next minutes. Use when the buyer names a real company " +
    "(e.g. Knorr-Bremse, Wabtec, Voith) and asks to research, check, vet, screen or look up news about it. " +
    "Do not use for SUPP_ ids or synthetic dataset names like 'Apex Technologies 491' (no web presence; use explain_supplier). Renders a live risk flag list.",
  priority: "core",
  stage: "finalists",
  input: z.object({
    company_name: z.string().min(2).describe("Legal or common name of a real company"),
    country: z.string().optional().describe("ISO country code if the buyer gave one"),
    website: z.string().optional(),
    focus: z.array(z.enum(["financial", "legal", "sanctions", "esg", "operations"])).optional(),
    supplier_id: z.string().optional().describe("Dataset supplier this company is linked to, if the buyer said so"),
  }),
  run: async (input, ctx): Promise<ResearchStarted> => {
    const { job_id } = await startResearch({
      company_name: input.company_name,
      country: input.country ?? null,
      website: input.website ?? null,
      focus: input.focus,
      depth: "standard",
    });
    const state: ResearchJobState = trackResearchJob(job_id, input.company_name);
    const handle = ctx.putResult(state); // live object: the tracker mutates it in place
    return { job_id, company_name: input.company_name, mode: researchMode(), supplier_id: input.supplier_id, handle };
  },
  summarize: (r) =>
    r.mode === "replay" && !isReplayCompany(r.company_name)
      ? `Research service is not connected (replay mode only covers Knorr-Bremse), so the job for ${r.company_name} will fail. Tell the buyer research for this company needs the live research service.`
      : `Started research job ${r.job_id} for ${r.company_name}${r.mode === "replay" ? " (replay mode, canned demo data)" : ""}. ` +
        "Progress and sourced risk flags appear in the research panel; the report is not available yet, so do not state findings.",
  view: (_r, handle) => `root = RiskFlagList("${handle}")`,
  uiActions: (r) => [{ type: "start_research", job_id: r.job_id, company_name: r.company_name, result_id: r.handle, supplier_id: r.supplier_id }],
  examples: ["Research Knorr-Bremse", "Check Knorr-Bremse for sanctions and legal issues"],
  workedExamples: [{ question: "Research Knorr-Bremse", input: { company_name: "Knorr-Bremse" } }],
});
