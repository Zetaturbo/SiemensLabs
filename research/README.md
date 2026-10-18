# Research service

Researches a real company on the web and returns a report where **every finding has a source and an exact quote**.
The frontend calls it at `POST {RESEARCH_API_URL}/tools/<tool>`. With `RESEARCH_API_URL` empty the dashboard plays a canned replay.

## Run it

```bash
cd research
cp .env.example .env          # paste the 3 keys: TAVILY_API_KEY, NEBIUS_API_KEY, LLM_API_KEY
python3 -m venv .venv && .venv/bin/pip install fastapi uvicorn pydantic httpx
scripts/serve.sh              # starts on :8001, check: curl localhost:8001/health
```

Then in the dashboard: `cd frontend && RESEARCH_API_URL=http://localhost:8001 npm run dev`, click **Research** under a company.
A run takes about 30 to 70 seconds.

| Key | Provider | Used for |
|---|---|---|
| `TAVILY_API_KEY` | Tavily | web search and reading pages |
| `NEBIUS_API_KEY` | Nebius | the fast models |
| `LLM_API_KEY` | NVIDIA | backup models |

## How a run works

1. **Identify** the company in the open GLEIF registry (name, country, LEI).
2. **Search**: 4 agents run in parallel, each only on its own source list (below). Code runs fixed searches first, the agent then reads the pages that matter.
3. **Claims**: every finding is a claim = statement + category + severity + **exact quote** + source URL.
4. **Quote check (code)**: the quote must appear word for word in the page we stored. If not, the claim is dropped.
5. **Verify (second model)**: labels each claim `verified`, `partial`, `unsupported` or `contradicted`.
6. **Rating (code)**: computed from verified claims only (next section).
7. **Report**: only verified claims are shown, each with its source link.

## Sources it reads

Closed lists. A search or fetch on any other domain is refused. Full list with reasons: `config/sources.json`.

- **News** (12)
  - tier 2 (established outlets and databases): `railwaygazette.com`, `railway-technology.com`, `railway-news.com`, `railvolution.net`, `eurailpress.de`, `progressiverailroading.com`, `trains.com`, `globalrailwayreview.com`, `handelsblatt.com`, `dw.com`, `tagesschau.de`, `apnews.com`
- **Company** (6) Plus the company's own website.
  - tier 1 (regulators, courts, registers, the company itself): `sec.gov`
  - tier 2 (established outlets and databases): `prnewswire.com`
  - tier 3 (aggregators, encyclopedia): `northdata.com`, `responsibilityreports.com`, `annualreports.com`, `wikipedia.org`
- **Legal** (25)
  - tier 1 (regulators, courts, registers, the company itself): `ofac.treasury.gov`, `home.treasury.gov`, `sanctionsmap.eu`, `finance.ec.europa.eu`, `gov.uk`, `un.org`, `justice.gov`, `ftc.gov`, `sec.gov`, `bundeskartellamt.de`, `ec.europa.eu`, `autoritedelaconcurrence.fr`, `bafa.de`, `courtlistener.com`, `curia.europa.eu`, `eur-lex.europa.eu`, `rechtsprechung-im-internet.de`, `thegazette.co.uk`, `find-and-update.company-information.service.gov.uk`, `worldbank.org`, `federalregister.gov`, `osha.gov`, `epa.gov`
  - tier 2 (established outlets and databases): `business-humanrights.org`
  - tier 3 (aggregators, encyclopedia): `opensanctions.org`
- **Science** (12)
  - tier 1 (regulators, courts, registers, the company itself): `era.europa.eu`, `eba.bund.de`, `eisenbahn-unfalluntersuchung.de`, `gov.uk`, `ntsb.gov`, `railroads.dot.gov`, `tsb.gc.ca`, `cordis.europa.eu`
  - tier 2 (established outlets and databases): `uic.org`, `patents.google.com`, `freepatentsonline.com`, `semanticscholar.org`

Not covered: paywalled sites (Reuters, BBC), social media, and sanctions lists as files (not built yet).

## How the rating is calculated

**Severity of one claim** is set by the agent: `high` = serious legal, safety or financial event with direct impact, `elevated` = significant,
`moderate` = notable, `low` = minor or routine.

**A claim only counts if it is `verified`.** A `high` claim also needs a second source from a different publisher saying the same thing, otherwise it stays `partial`.

**Then the report is computed with plain rules, no model involved:**

- `overall_assessment` = the **highest severity among verified claims** (none verified: `low`)
- each category (`financial`, `legal`, `sanctions`, `quality`, `safety`, `esg`, `operations`, `geopolitical`) = the highest severity among verified claims **in that category** (none: `low`)
- each finding = verified claims about one event, severity = the highest of them

It is the worst verified finding, not an average, and not comparable to the dataset's 0 to 100 scores. `low` can mean "nothing found in the sources we can read".

**Real example: Knorr-Bremse** (`mocks/research_report_knorr_bremse.json`, 17 claims found)

| Step | Result |
|---|---|
| Quote not found on the page | 1 claim dropped |
| Verifier says only partly supported | 4 claims `partial`, not used |
| Verified | 12 claims |
| Highest severity among the 12 | `elevated`: 3 claims from `federalregister.gov` and `justice.gov` (2018 US antitrust complaint) |
| **overall_assessment** | **elevated** |
| legal | elevated (6 verified claims, 5 sources: the antitrust claims, a court registry entry, a board finding, a news item) |
| operations | low (5 verified claims: group structure, patents) |
| financial | low (1 verified claim: sales EUR 7.8 billion) |
| sanctions, quality, safety, esg, geopolitical | low, "no verified findings" |

## API

| Tool | What it does |
|---|---|
| `research_company` | start a run, returns `job_id` at once (refuses `SUPP_` and `BRK_` ids) |
| `get_research_status` | status and live progress |
| `get_research_report` | the report once `done` |
| `confirm_entity` | pick one when several companies match (the dashboard auto-picks the best, `auto_confirm`) |
| `get_research_claims`, `list_research_jobs` | all claims with status, job history |

Limits per run (env vars): 240 s (`RESEARCH_MAX_RUN_SECONDS`), 40 Tavily calls (`RESEARCH_MAX_TAVILY_CALLS`), 3 runs at once (`RESEARCH_MAX_CONCURRENT_RUNS`).

## More

Tests: `.venv/bin/python -m pytest`. Docker: `docker compose up --build`. Why these sources and models, with measurements: `docs/SOURCES_AND_MODELS.md`.
