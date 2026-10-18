import type { ResearchProgressStep, ResearchReport, ResearchStatus } from "./types";

/**
 * Replay mode (RESEARCH_API_URL unset): a canned progress sequence and report for the demo
 * company Knorr-Bremse, timed so the UI shows the agent working. Not a live web search.
 */
const SEQUENCE: Array<{ at: number; step: ResearchProgressStep }> = [
  { at: 800, step: { step: "plan", message: "Planned 6 research questions: identity, financials, litigation, sanctions, ESG, operations" } },
  { at: 2200, step: { step: "resolve", message: "Resolved entity: Knorr-Bremse AG, Munich (DE)" } },
  { at: 4000, step: { step: "search", message: "Searching company and insolvency registers" } },
  { at: 5800, step: { step: "search", message: "Checking EU, UN and OFAC sanctions lists" } },
  { at: 7600, step: { step: "search", message: "Searching antitrust and court records" } },
  { at: 9200, step: { step: "red_flag", message: "Found a 2018 EU cartel settlement on rail braking systems, checking scope" } },
  { at: 11000, step: { step: "search", message: "Reviewing sustainability reporting and recent news" } },
  { at: 12800, step: { step: "synthesize", message: "Writing report: 2 flags, 4 sources" } },
];
const DONE_AT = 14000;
const FAIL_AT = 2500;

export const REPLAY_REPORT: ResearchReport = {
  company: { legal_name: "Knorr-Bremse AG", country: "DE", website: "https://www.knorr-bremse.com", lei: null },
  summary:
    "Knorr-Bremse AG, headquartered in Munich, is a listed manufacturer of braking and on-board systems for rail and commercial vehicles. " +
    "Public sources show no insolvency, distress or sanctions signals. The main findings are historical antitrust matters from 2018 " +
    "(an EU cartel settlement concerning railway braking systems and a US no-poach settlement). Overall the profile is moderate, " +
    "driven by past compliance exposure rather than current operations.",
  overall_assessment: "moderate",
  risk_flags: [
    {
      category: "legal",
      severity: "moderate",
      title: "EU cartel settlement on railway braking systems (2018)",
      finding:
        "The European Commission fined Knorr-Bremse in a 2018 cartel settlement concerning braking systems for rail vehicles. " +
        "The conduct is historical; request evidence of the current antitrust compliance programme in the RFI.",
      date: "2018",
      sources: [{ title: "European Commission press corner (competition decisions)", url: "https://ec.europa.eu/commission/presscorner/home/en", publisher: "European Commission" }],
    },
    {
      category: "legal",
      severity: "low",
      title: "US no-poach settlement with the Department of Justice (2018)",
      finding:
        "In 2018 Knorr-Bremse and Wabtec agreed with the US Department of Justice to end agreements not to recruit each other's employees. Civil settlement; no ongoing proceedings found.",
      date: "2018",
      sources: [{ title: "US Department of Justice, Antitrust Division", url: "https://www.justice.gov/atr", publisher: "US Department of Justice" }],
    },
  ],
  category_assessment: [
    { category: "financial", assessment: "low", rationale: "Listed company publishing audited annual reports; no insolvency or distress signals found." },
    { category: "legal", assessment: "moderate", rationale: "Two historical antitrust settlements (EU 2018, US 2018); none found ongoing." },
    { category: "sanctions", assessment: "low", rationale: "No match for the legal entity on EU, UN or OFAC lists." },
    { category: "esg", assessment: "low", rationale: "Publishes sustainability reporting; no recent ESG controversy found." },
    { category: "operations", assessment: "low", rationale: "Global rail production footprint; no recent supply disruption reported." },
  ],
  sources: [
    { title: "Knorr-Bremse AG corporate website", url: "https://www.knorr-bremse.com" },
    { title: "European Commission press corner", url: "https://ec.europa.eu/commission/presscorner/home/en" },
    { title: "US Department of Justice, Antitrust Division", url: "https://www.justice.gov/atr" },
    { title: "OFAC sanctions list search", url: "https://sanctionssearch.ofac.treas.gov" },
  ],
  limitations:
    "Replay mode: canned demo report served because RESEARCH_API_URL is not set. It was not produced by a live web search; " +
    "verify every finding against the linked sources before using it in a sourcing decision.",
};

export const isReplayCompany = (name: string) => /knorr[\s-]*bremse/i.test(name);

/** Status of a replay job `elapsedMs` after it started. */
export function replayStatus(job_id: string, company: string, elapsedMs: number): ResearchStatus {
  if (!isReplayCompany(company)) {
    return elapsedMs < FAIL_AT
      ? { job_id, status: "running", progress: [{ step: "plan", message: `Planning research for ${company}` }] }
      : {
          job_id,
          status: "failed",
          progress: [{ step: "plan", message: `Planning research for ${company}` }],
          error: `Replay mode only has a canned report for Knorr-Bremse. Set RESEARCH_API_URL to research ${company}.`,
        };
  }
  const progress = SEQUENCE.filter((s) => s.at <= elapsedMs).map((s) => s.step);
  if (elapsedMs >= DONE_AT) return { job_id, status: "done", progress };
  return { job_id, status: progress.length ? "running" : "queued", progress };
}

export const REPLAY_DURATION_MS = DONE_AT;
