# Research service

Python service that researches a real company on the web and returns a verified, source-linked risk report. Spec: `docs/SPEC.md`.
The frontend calls it at `POST {RESEARCH_API_URL}/tools/<tool>` with the tool input as JSON and gets back `{ok, data, meta, error}`,
the same convention as the data service in `api/`. With `RESEARCH_API_URL` empty the frontend plays a canned replay instead.

## Start it

```bash
cd research
cp .env.example .env              # fill TAVILY_API_KEY, LLM_API_KEY (NVIDIA free tier) and NEBIUS_API_KEY
scripts/serve.sh                  # port 8001; uses uv, else .venv, else python3
curl localhost:8001/health        # which keys are configured, which simulated companies exist
```

Then set `RESEARCH_API_URL=http://localhost:8001` in `frontend/.env` and ask the chat "research Knorr-Bremse" (real web, about one to two
minutes) or "research Fennic Railway Brakes GmbH" (simulated demo company, under a minute, no Tavily credits, labeled simulated).

Try it without the frontend: `.venv/bin/python scripts/run_research.py "Knorr-Bremse" --country DE --website knorr-bremse.com`.

## Tools

| Tool | What it does |
|---|---|
| `research_company` | Starts a run, returns `job_id` at once. Refuses `SUPP_` and `BRK_` ids (`SYNTHETIC_ENTITY`) |
| `get_research_status` | Status, live progress events, candidates when the company is ambiguous |
| `confirm_entity` | The buyer's choice when several companies match, the run then continues |
| `get_research_report` | The verified report once the job is `done` (`NOT_READY` before) |
| `get_research_claims`, `list_research_jobs` | All claims with their verification status, and the job history |

## What it searches

Only closed lists of sources. A search and a page fetch are refused for any domain that is not on the list of the lane doing the
search, and this is enforced twice (Tavily's domain filter and a check of every URL in our code). Everything is in `config/sources.json`;
how the lists were chosen and the evidence is in `docs/SOURCES_AND_MODELS.md`.

Trust tiers: **1** = primary (regulator, court, official register, official list, or the company itself); **2** = established trade press,
wire or broadcaster; **3** = aggregator or encyclopedia, which never counts as the only source for a high-severity claim.


**News lane** (12 domains): adverse media: recalls, accidents, strikes, fines, lawsuits, insolvency, layoffs, fraud.

| Domain | Trust tier | Kind |
|---|---|---|
| `railwaygazette.com` | 2 | trade press |
| `railway-technology.com` | 2 | trade press |
| `railway-news.com` | 2 | trade press |
| `railvolution.net` | 2 | trade press |
| `eurailpress.de` | 2 | trade press |
| `progressiverailroading.com` | 2 | trade press |
| `trains.com` | 2 | trade press |
| `globalrailwayreview.com` | 2 | trade press |
| `handelsblatt.com` | 2 | business daily |
| `dw.com` | 2 | broadcaster |
| `tagesschau.de` | 2 | broadcaster |
| `apnews.com` | 2 | wire |

**Company lane** (6 domains): what the company says about itself: governance, sustainability, certifications, ownership, filings.

| Domain | Trust tier | Kind |
|---|---|---|
| `sec.gov` | 1 | filings |
| `prnewswire.com` | 2 | press releases |
| `northdata.com` | 3 | register aggregator |
| `responsibilityreports.com` | 3 | sustainability reports |
| `annualreports.com` | 3 | annual reports |
| `wikipedia.org` | 3 | encyclopedia |
Plus the company's own website for each run (tier 1, self-reported).

**Legal lane** (25 domains): sanctions, enforcement and competition cases, court cases, insolvency and register entries, debarment, export controls.

| Domain | Trust tier | Kind |
|---|---|---|
| `ofac.treasury.gov` | 1 | sanctions |
| `home.treasury.gov` | 1 | sanctions |
| `sanctionsmap.eu` | 1 | sanctions |
| `finance.ec.europa.eu` | 1 | sanctions |
| `gov.uk` | 1 | sanctions and regulators |
| `un.org` | 1 | sanctions |
| `opensanctions.org` | 3 | sanctions aggregator |
| `justice.gov` | 1 | enforcement |
| `ftc.gov` | 1 | enforcement |
| `sec.gov` | 1 | enforcement |
| `bundeskartellamt.de` | 1 | competition |
| `ec.europa.eu` | 1 | competition |
| `autoritedelaconcurrence.fr` | 1 | competition |
| `bafa.de` | 1 | supply chain law |
| `courtlistener.com` | 1 | courts |
| `curia.europa.eu` | 1 | courts |
| `eur-lex.europa.eu` | 1 | official journal |
| `rechtsprechung-im-internet.de` | 1 | courts |
| `thegazette.co.uk` | 1 | insolvency |
| `find-and-update.company-information.service.gov.uk` | 1 | register |
| `worldbank.org` | 1 | debarment |
| `federalregister.gov` | 1 | export controls |
| `osha.gov` | 1 | safety enforcement |
| `epa.gov` | 1 | environmental enforcement |
| `business-humanrights.org` | 2 | ngo database |

**Science lane** (12 domains): safety incidents, accident investigations, product recalls, patents and technical papers.

| Domain | Trust tier | Kind |
|---|---|---|
| `era.europa.eu` | 1 | rail safety |
| `eba.bund.de` | 1 | rail safety |
| `eisenbahn-unfalluntersuchung.de` | 1 | accident investigation |
| `gov.uk` | 1 | accident investigation |
| `ntsb.gov` | 1 | accident investigation |
| `railroads.dot.gov` | 1 | rail safety |
| `tsb.gc.ca` | 1 | accident investigation |
| `uic.org` | 2 | standards body |
| `patents.google.com` | 2 | patents |
| `freepatentsonline.com` | 2 | patents |
| `cordis.europa.eu` | 1 | research projects |
| `semanticscholar.org` | 2 | papers |

Also used: **GLEIF** (the open company registry, no key) to identify the company and its LEI before searching. Fictional demo companies
(`sandbox/`) use their own simulated documents and no web.

Not covered: paywalled or blocking sites (for example Reuters, BBC, the Guardian), social media, and the official sanctions lists as
files (OFAC, EU and UN lists are chosen but not screened by code yet, ticket R21), so a sanctions finding comes only from pages the legal
lane can read.

## What it looks for

Four lane agents run in parallel, each on its own sources. Each starts from fixed baseline searches run by the service, plus the questions
the planner wrote for that company, and then reads the pages that matter:

| Lane | Looks for |
|---|---|
| News | Recalls, accidents, strikes, fines, lawsuits, insolvency, layoffs, fraud, investigations |
| Company | Governance, sustainability reports, supplier code of conduct, certifications, ownership, filings |
| Legal | Sanctions, enforcement and competition cases, court cases, insolvency notices, debarment, export controls |
| Science | Safety incidents, accident investigations, recalls, patents and technical findings |

Every finding is a **claim** with: a statement, a category (`financial`, `legal`, `sanctions`, `quality`, `safety`, `esg`, `operations`,
`geopolitical`), a severity, the **exact quote** it is based on, the source URL, and the date of the event when the page states it.
Agents are told to prefer adverse events, legal and regulatory matters and safety issues, and to skip plain facts such as headcount.

## How the rating is decided

Severity is given per claim, and the ratings in the report are computed from verified claims by code, never written by a model.

**1. Severity of a claim.** The lane agent assigns it with these definitions: `high` = serious legal, safety or financial event with direct
impact; `elevated` = significant; `moderate` = notable; `low` = minor or routine. This is a model judgement, so it is the softest part.

**2. A claim only counts if it passes the checks.**

1. The source must be on the lane's list (otherwise refused).
2. The quote must appear word for word in the stored page text (whitespace ignored). A quote that is not found is dropped and counted.
3. A second model (the verifier, a different model family from the lane agents) reads the quote and its surrounding text and labels the claim:
   `verified` (the quote fully supports the statement and is about this company), `partial` (supports only part), `unsupported` (does not
   address it, or is about a different company) or `contradicted` (says the opposite or other facts).
4. A `high` claim also needs a **second source from a different publisher** that states the same fact. Without it, it stays `partial`.

Only `verified` claims appear in the report body. The others are counted in `verification_summary` and stay in `claims[]` with their status.

**3. The ratings.**

| Field | How it is computed |
|---|---|
| `overall_assessment` | The highest severity among verified claims. No verified claims gives `low`. |
| `category_assessment` (one per category) | The highest severity among verified claims in that category. A category with none gives `low` and the note "No verified findings in the checked sources. This is not proof that nothing exists." |
| Each risk flag | A group of verified claims about one event. Its severity is the highest of its claims, and flags are sorted by severity. |
| `verification_summary` | Counts: total claims, verified, partial (unconfirmed), dropped (not verbatim, unsupported or contradicted). |
| `limitations` | Written from the counts, the lanes that failed or found nothing, and a reminder that only closed lists were searched. |

The summary and the flag texts are written by a model, but code checks them: every flag must cite verified claims, and no number may
appear that is not in the cited claims. Whatever fails the check is replaced by the claim text.

**What the rating is not.** It is the worst verified finding, not an average and not a score comparable to the dataset's risk scores
(0 to 100). One serious verified finding makes a company `elevated` or `high` even if everything else is clean, and `low` can simply mean
nothing was found in the sources we can read.

## Settings

| Variable | Default | Meaning |
|---|---|---|
| `TAVILY_API_KEY` | | Web search and page extraction for real companies |
| `LLM_API_KEY`, `LLM_BASE_URL` | NVIDIA free tier | Last model in every chain, also the frontend's |
| `NEBIUS_API_KEY` | | The paid provider the models in `config/models.json` run on first |
| `RESEARCH_STORE_DIR` | `research/var/jobs` | One JSON file per job, survives a restart |
| `RESEARCH_MAX_CONCURRENT_RUNS` | 3 | Further runs wait in a queue |
| `RESEARCH_MAX_RUN_SECONDS` | 240 | Hard time limit per run, after which the run finishes with what it has |
| `RESEARCH_MAX_LANE_STEPS`, `RESEARCH_MAX_CLAIMS_PER_LANE` | 5, 6 | Tool calls and claims per lane agent |
| `RESEARCH_MAX_TAVILY_CALLS` | 40 | Tavily requests per run (the budget guard) |

## Docker

```bash
docker compose up --build         # uses research/.env, port 8001, jobs in a volume
```

The image has not been built on the machine that wrote it (no Docker daemon was running), so treat the first build as a test.

## Models and sources

`config/sources.json` holds the closed source list per lane, `config/models.json` the model chain per agent role. Why these, with the
measurements: `docs/SOURCES_AND_MODELS.md`. Scripts in `scripts/`: `check_setup.py`, `probe_sources.py`, `build_evidence.py`,
`eval_models.py` (models on real tasks), `bench_pipeline.py` (whole workflow, model combinations), `run_research.py`.

## Tests

```bash
cd research
uv run pytest                      # or .venv/bin/python -m pytest
```

All tests run without keys: a scripted model and the simulated companies stand in for the web and the LLMs.
