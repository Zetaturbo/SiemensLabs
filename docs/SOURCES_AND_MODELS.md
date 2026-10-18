# Sources and models

Locked on 2026-10-18. Everything here comes from measurements on real pages and real suppliers. The raw data is in
`research/config/` (`sources.json`, `models.json`, `source_probe_results.json`) and `research/eval/` (evidence, gold labels,
results). The scripts that produced it are in `research/scripts/`.

## 1. Sources

### How the lists were chosen

- 86 candidate domains were probed through Tavily with three real rail suppliers: Knorr-Bremse, Wabtec and Vossloh
  (`scripts/probe_sources.py`). For each domain: does it return hits that mention the company, and can the page text be extracted?
- News and company sources must return relevant hits and extractable text. Legal and science sources are mostly lists, regulators,
  courts and registers, where no hit for a company is the normal result (these three are not sanctioned), so they must be primary
  authorities with extractable pages.
- Every domain has a trust tier. Tier 1: regulator, court, register, official list, or the company itself. Tier 2: established trade
  press, wire or broadcaster. Tier 3: aggregator or encyclopedia, never the only source for a high-severity claim.
- The lists are closed. Tavily's `include_domains` filter restricts each search, and our adapter checks every returned and every
  requested URL against the lane's list as well. A fetch of any other URL is refused.
- Page text is cleaned of navigation before agents see it and before it is stored. Raw extracted pages were mostly menus and
  site chrome, which wastes tokens and hides the article.

### News lane (12 domains)

| Domain | Tier | Kind | Why it is on the list |
|---|---|---|---|
| `railwaygazette.com` | 2 | trade press | Rail industry news; relevant for 3 of 3 test companies (advanced extraction) |
| `railway-technology.com` | 2 | trade press | Rail industry news; relevant for 3 of 3 |
| `railway-news.com` | 2 | trade press | Rail industry news; relevant for 3 of 3 |
| `railvolution.net` | 2 | trade press | Rail industry news; relevant for 3 of 3 |
| `eurailpress.de` | 2 | trade press | German-language rail trade press; relevant for 3 of 3 |
| `progressiverailroading.com` | 2 | trade press | North American rail trade press; relevant for 3 of 3 |
| `trains.com` | 2 | trade press | Rail news; relevant for 3 of 3 |
| `globalrailwayreview.com` | 2 | trade press | Rail industry news; relevant for 3 of 3, extraction was unreliable in one probe |
| `handelsblatt.com` | 2 | business daily | German business daily, strong for German suppliers; some pages are paywalled |
| `dw.com` | 2 | broadcaster | International public broadcaster; extracts cleanly |
| `tagesschau.de` | 2 | broadcaster | German public broadcaster; extracts cleanly |
| `apnews.com` | 2 | wire | General wire service; needs advanced extraction (advanced extraction) |
### Company lane (6 domains)

| Domain | Tier | Kind | Why it is on the list |
|---|---|---|---|
| `sec.gov` | 1 | filings | US filings (10-K, 8-K, litigation notes) for US-listed companies such as Wabtec |
| `prnewswire.com` | 2 | press releases | Company-issued press releases; relevant for 2 of 3 |
| `northdata.com` | 3 | register aggregator | German register data: owners, financials, insolvency notes; relevant for 3 of 3 |
| `responsibilityreports.com` | 3 | sustainability reports | Archive of sustainability reports; relevant for 2 of 3 |
| `annualreports.com` | 3 | annual reports | Archive of annual reports; relevant for 2 of 3 |
| `wikipedia.org` | 3 | encyclopedia | Ownership and basic facts; relevant for 3 of 3; never the only source for a high-severity claim |

The company's own website is added for each run after the company is identified (tier 1, self-reported).
### Legal lane (25 domains)

| Domain | Tier | Kind | Why it is on the list |
|---|---|---|---|
| `ofac.treasury.gov` | 1 | sanctions | US sanctions notices and recent actions |
| `home.treasury.gov` | 1 | sanctions | US Treasury press releases on sanctions and enforcement |
| `sanctionsmap.eu` | 1 | sanctions | EU sanctions map |
| `finance.ec.europa.eu` | 1 | sanctions | EU financial sanctions pages |
| `gov.uk` | 1 | sanctions and regulators | UK sanctions (OFSI), competition (CMA) and rail accident reports (RAIB) |
| `un.org` | 1 | sanctions | UN Security Council sanctions; extraction worked in one probe and failed in another |
| `opensanctions.org` | 3 | sanctions aggregator | Aggregates many lists; used to find the primary list, not as the final source |
| `justice.gov` | 1 | enforcement | US Department of Justice; relevant for 2 of 3 |
| `ftc.gov` | 1 | enforcement | US competition and consumer enforcement; relevant for 1 of 3 |
| `sec.gov` | 1 | enforcement | US securities enforcement and litigation releases |
| `bundeskartellamt.de` | 1 | competition | German competition authority; relevant for 1 of 3 |
| `ec.europa.eu` | 1 | competition | European Commission press corner and competition decisions; relevant for 1 of 3 |
| `autoritedelaconcurrence.fr` | 1 | competition | French competition authority; relevant for 1 of 3 |
| `bafa.de` | 1 | supply chain law | German authority for the Supply Chain Due Diligence Act |
| `courtlistener.com` | 1 | courts | US court dockets and opinions; relevant for 1 of 3 |
| `curia.europa.eu` | 1 | courts | Court of Justice of the EU |
| `eur-lex.europa.eu` | 1 | official journal | EU legal acts including sanctions regulations; needs advanced extraction (advanced extraction) |
| `rechtsprechung-im-internet.de` | 1 | courts | German federal court decisions; relevant for 1 of 3 |
| `thegazette.co.uk` | 1 | insolvency | UK official gazette including insolvency notices; relevant for 1 of 3 |
| `find-and-update.company-information.service.gov.uk` | 1 | register | UK Companies House; relevant for 2 of 3 |
| `worldbank.org` | 1 | debarment | World Bank debarred firms list, extracts with its table |
| `federalregister.gov` | 1 | export controls | US Federal Register: Entity List and other export control notices; relevant for 1 of 3 |
| `osha.gov` | 1 | safety enforcement | US workplace safety enforcement; relevant for 1 of 3 |
| `epa.gov` | 1 | environmental enforcement | US environmental enforcement; relevant for 1 of 3 |
| `business-humanrights.org` | 2 | ngo database | Human rights allegations and company responses; no hits for the three test companies |
### Science lane (12 domains)

| Domain | Tier | Kind | Why it is on the list |
|---|---|---|---|
| `era.europa.eu` | 1 | rail safety | EU Agency for Railways; relevant for 2 of 3 |
| `eba.bund.de` | 1 | rail safety | German Federal Railway Authority |
| `eisenbahn-unfalluntersuchung.de` | 1 | accident investigation | German rail accident investigation body (BEU) |
| `gov.uk` | 1 | accident investigation | UK Rail Accident Investigation Branch reports |
| `ntsb.gov` | 1 | accident investigation | US accident investigations; relevant for 1 of 3 |
| `railroads.dot.gov` | 1 | rail safety | US Federal Railroad Administration; relevant for 1 of 3 |
| `tsb.gc.ca` | 1 | accident investigation | Transportation Safety Board of Canada; relevant for 1 of 3 |
| `uic.org` | 2 | standards body | International Union of Railways; relevant for 1 of 3 |
| `patents.google.com` | 2 | patents | Patents; relevant for 2 of 3 |
| `freepatentsonline.com` | 2 | patents | Patent full text; needs advanced extraction (advanced extraction) |
| `cordis.europa.eu` | 1 | research projects | EU-funded research projects; relevant for 2 of 3 |
| `semanticscholar.org` | 2 | papers | Research papers; needs advanced extraction (advanced extraction) |

### Structured sources (read by code, not searched by an agent)

| Id | Kind | What it gives | Checked |
|---|---|---|---|
| `ofac_sdn` (legal) | sanctions list, csv | Full list as a file, matched by code (exact and fuzzy name match), no web search | 2026-10-18 http 200 |
| `eu_consolidated` (legal) | sanctions list, csv | Full list as a file, matched by code (exact and fuzzy name match), no web search | 2026-10-18 http 200 |
| `un_consolidated` (legal) | sanctions list, xml | Full list as a file, matched by code (exact and fuzzy name match), no web search | 2026-10-18 http 200 |
| `gleif` (company) | entity registry api, json api, no key | entity resolution: LEI, legal name, country, status, parent relationships | 2026-10-18 found Knorr-Bremse AG, LEI 5299001GRRO0Z25YZT52 |

Sanctions are screened against the official lists directly (exact and fuzzy name matching, deterministic, free), because a web
search cannot prove that a name is absent from a list. GLEIF resolves the legal entity. Both are tickets R9 and R21.

### Dropped, and why

| Domains | Reason |
|---|---|
| reuters.com, bbc.com, theguardian.com, railjournal.com | pages could not be extracted |
| competition-cases.ec.europa.eu, worldwide.espacenet.com | pages could not be extracted |
| insolvenzbekanntmachungen.de | no results (the portal is an interactive search) |
| finance.yahoo.com, marketscreener.com | extracted pages were menus, paywall text and ticker tables with almost no article text |
| gleif.org, opencorporates.com, bundesanzeiger.de, unglobalcompact.org, cdp.net | no relevant page for the test companies; GLEIF is used through its API instead |
| globenewswire.com, businesswire.com, ecovadis.com | no relevant page, or extraction failed |
| euronews.com, aljazeera.com, npr.org, swissinfo.ch, france24.com, supplychaindive.com, railtechnology.com, railwayage.com, cnbc.com, freightwaves.com, forbes.com, industryweek.com | no or little coverage of the test suppliers, or thin pages |
| oecd.org, sam.gov, justia.com, e-justice.europa.eu | noise (very large pages with no relevant hit) or extraction failed |
| arxiv.org, openalex.org, ieeexplore.ieee.org, rssb.co.uk, sciencedirect.com, mdpi.com, transportation.gov, link.springer.com | no hits for the test companies, or thin pages |

### What reading real pages showed

- The strongest evidence for the legal lane is real and primary: the US Department of Justice final judgment against Knorr-Bremse
  and Westinghouse Air Brake (Wabtec) under the Sherman Act (2018), the European Commission's in-depth merger investigation of
  Knorr-Bremse and Haldex (2017), and the Bundeskartellamt's rail cartel fine on a Vossloh subsidiary (2016).
- Adverse news about these suppliers is thin in the news lane. The Wabtec and Progress Rail lawsuit (2023) came from trade press.
- The science lane returns patents and old accident reports for these suppliers, which are weak risk evidence. It is better at
  safety questions about a named product or accident.
- Known gaps: EU competition cases and German insolvency notices have no extractable source yet. Large wires (Reuters) are not
  extractable.

## 2. Models

### Method

Two providers on the same OpenAI-compatible interface: Nebius (paid credits) and the NVIDIA free tier the frontend uses. Each model
got the same real tasks over the same real pages (`scripts/eval_models.py`). Scoring is done by code wherever possible.

| Task | Input | Scored by |
|---|---|---|
| Planner | A real company, the four lanes and their domain lists | Every lane covered, 6 to 12 questions, company named, no domain outside the lists, a sanctions question and an adverse-news question (3 companies) |
| Extract | Two real pages per lane and company from the locked sources (11 sets) | Quote is an exact substring of the page (a non-verbatim quote is dropped by the verifier), source URL is one of the given pages, recall of hand-picked gold facts |
| Verify | 45 hand-labelled statement and quote pairs cut from those pages: 12 verified, 11 partial, 11 contradicted, 11 unsupported | Accuracy, and the share of unsupported or contradicted claims wrongly called verified (the costly error) |
| Writer | Verified claims | Every sentence cites known claim ids, every claim is used, no number that is not in the cited claims |

### Results

| Model | Planner | Extract: exact quotes | Extract: gold recall | Claims per set | Verify: accuracy | Verify: false "verified" | Verify: false reject | Writer | Seconds per call (plan / extract / verify) |
|---|---|---|---|---|---|---|---|---|---|
| moonshotai/Kimi-K3 | 1 | 1 | 0.712 | 6 | 1 | 0 | 0 | 1 | 10.1 / 9.6 / 1.6 |
| deepseek-ai/DeepSeek-V4-Pro | 1 | 0.922 | 0.727 | 4.6 | 0.933 | 0 | 0.083 | 1 | 5 / 3.6 / 0.8 |
| deepseek-ai/DeepSeek-V4.1-Flash | 1 | 0.97 | 0.818 | 6 | 0.956 | 0 | 0.167 | 1 | 17 / 15.2 / 3.2 |
| deepseek-ai/DeepSeek-V4-Pro-0813 | 1 | 0.967 | 0.727 | 5.5 | 0.911 | 0 | 0.083 | 1 | 18 / 14.3 / 2.9 |
| openai/gpt-oss-120b | 1 | 0.731 | 0.621 | 6.1 | 0.956 | 0 | 0.083 | 1 | 2.8 / 3.6 / 1 |
| MiniMaxAI/MiniMax-M3 | 1 | 0.684 | 0.545 | 5.2 | 0.956 | 0 | 0.083 | 1 | 4.7 / 4.7 / 1.4 |
| moonshotai/Kimi-K2.6 | 1 | 1 * | 0.5 * | 0.7 | 0.844 | 0 | 0.167 | 1 | 13 / 19.5 / 6.6 |
| zai-org/GLM-5.3 | 0.667 | 0.833 * | 1 * | 1.1 | 0.867 | 0 | 0.167 | 1 | 12.5 / 11 / 3.7 |
| zai-org/GLM-5.3-Flash | 0.667 | - | - | - | - | - | - | - | 19.5 / - / - |
| Qwen/Qwen3.5-397B-A17B | 0.952 | - | - | - | - | - | - | - | 28.4 / - / - |
| nvidia/Nemotron-3-Ultra-550b-a55b | 0.905 | 0.87 | 0.519 | 4.9 | 0.933 | 0 | 0.167 | 1 | 6.2 / 7 / 2.9 |
| nvidia/nemotron-3-super-120b-a12b | 0.762 | - | - | - | - | - | - | - | 5.6 / - / - |
| free tier: nvidia/nemotron-3-super-120b-a12b | not finished | | | | | | | | |
| NousResearch/Hermes-4-405B | not finished | | | | | | | | |

`*` Most extraction sets for this model returned no usable output (claims per set far below the others), so its extraction scores
cover only the sets that worked. The cause was not investigated.

How to read it: exact quotes and gold recall matter most for lane agents. A quote that is not verbatim is thrown away by the
verifier, so a model with a low exact rate loses real findings. For the verifier, a false "verified" is the dangerous error and
every model scored 0 on it here. The writer test is saturated (every model passes), so it does not separate the models.

### Roles (locked after end-to-end runs)

The per-task results above ranked single calls. The final choice was made by running the whole workflow with four model combinations
on the two simulated companies, whose ground truth is known (`scripts/bench_pipeline.py`, 2 runs each, `eval/bench_pipeline.json`).

| Combination | Fennic (6 documents, serious findings): median time, verified, flags, coverage, rating | Pradova (4 documents, clean): median time, rating |
|---|---|---|
| current (Flash lanes, Kimi K3 verifier) | 45 s, 9, 5, 0.75, elevated | 17 s, low |
| fast (V4 Pro lanes, gpt-oss verifier) | 22 s, 9, 3.5, 0.75, high | 15 s, low |
| **flash-lane (Flash lanes, gpt-oss verifier)** | **23 s, 10.5, 6, 0.83, high** | **14 s, low** |
| pro-k3 (V4 Pro lanes, Kimi K3 verifier) | 34 s, 8.5, 4, 0.75, elevated | 16 s, low |

Kimi K3 is the most accurate verifier in the task benchmark but adds 15 to 35 seconds as a reasoning model, and gpt-oss-120b was equally
good in the full workflow. The chosen chains (first is the primary, each next one is the fallback):

| Role | Chain |
|---|---|
| Planner and report writer | DeepSeek V4 Pro, Kimi K3, Nemotron 3 Super (Nebius), Nemotron 3 Super (free tier) |
| Lane agents and entity resolution | DeepSeek V4.1 Flash, DeepSeek V4 Pro, Nemotron 3 Super (free tier) |
| Verifier | gpt-oss-120b, MiniMax M3, Kimi K3, Nemotron 3 Super (free tier) |

A reply that is empty or not valid JSON counts as a failure and the chain moves to the next model. Every chain ends on the free NVIDIA
tier, which is slower and a safety net only.

### Speed in production

Measured, not estimated: a simulated company finishes in 13 to 30 seconds. A real company on the live web took 62 to 155 seconds in
earlier runs (before the fixed baseline searches and the final models); the live timing with the final setup is in `docs/INTEGRATION.md`.
The service also enforces hard caps (tool calls per lane, Tavily requests, 240 seconds per run), so a run cannot take unbounded time.

### Caveats

- Small test set, one labeller (the gold labels were written by hand once, and the partial against contradicted boundary is a
  judgement). Treat differences of a few points as noise. The 45 of 45 for Kimi K3 is real on this set and will not hold at that level on a larger one.
- Not finished or not measured: Nemotron 3 Super (Nebius and free tier), GLM-5.3 Flash, Qwen3.5 and Hermes 4 did not finish extract,
  verify and writer before the run was stopped (the benchmark was cut after 14 minutes; their planner scores are in the table where
  they exist). Super and Ultra were already the frontend team's models, so rerun them with
  `.venv/bin/python scripts/eval_models.py --models nemotron --tasks extract,verify,writer`. The tool-calling loop on the real sources is now
  covered by the end-to-end runs above, which is what the chains were chosen on.
- The writer task is deterministic and saturated. Faithfulness of prose beyond cited ids and numbers is not measured.
- Published benchmarks for these models are mostly vendor-reported and none cover quoting or faithfulness, so they were not used to rank.
