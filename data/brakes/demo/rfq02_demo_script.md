# Live Demo Script: RFQ-02, Rail Brake Pads for a Regional Train

For presenters and jury preparation. The agent does not see this file; it follows the procedure in
`.claude/skills/brake-rfq-procurement/SKILL.md` and gets every number from the database.

**Setup:** brake data loaded (`db/ingest_brakes.py`), migrations up to `005_run_sql_brakes.sql` applied.
**Requirement:** 30,000 rail brake pads per year, ISO/TS 22163 certified, lead time of 90 days or less, annual capacity
of at least 30,000 units.
**Risk gate (demo rule):** Total Risk Index below 50 and Financial Health Score below 50.
**Story in one line:** the cheapest offer is too slow, the cheapest qualified offer is financially unsafe, and the agent
finds the best safe choice and puts a price on that safety.

Machine-readable version (same JSONL schema as the eval set): `rfq02_demo_v1.jsonl`, items `BPE-D001` to `BPE-D009`.
All numbers below are from the simulated dataset.

---

### 1. Discovery

**Ask:** "We need 30,000 rail brake pads a year for a regional train. Which suppliers offer rail brake pads?"

**Expected:** 9 suppliers: BRK_0003, BRK_0009, BRK_0013, BRK_0025, BRK_0030, BRK_0046, BRK_0049, BRK_0050, BRK_0058.

**Jury should notice:** the agent goes from a plain-language request to a supplier list with prices, lead times and
capacity in one step, from live data.

### 2. Qualification

**Ask:** "Which of them meet our mandatory requirements: ISO/TS 22163 certified, lead time of 90 days or less, and
capacity of at least 30,000 units a year?"

**Expected:** 4 qualify: BRK_0030, BRK_0046, BRK_0049, BRK_0058. 5 are excluded.

**Jury should notice:** hard requirements cut the field from 9 to 4 instantly; this is the step buyers do by hand in
spreadsheets today.

### 3. Exclusion reason

**Ask:** "BRK_0009 is the cheapest rail brake pad offer in the market. Why is it not on the shortlist?"

**Expected:** BRK_0009 (Ardenfield Friction Rail AB) quotes EUR 83.15 and meets certification and capacity, but its lead
time is 102 days against a limit of 90. That is the only failed requirement.

**Jury should notice:** the agent explains a decision precisely, down to the one requirement that fails, instead of
just filtering silently.

### 4. Cheapest qualified offer and annual spend

**Ask:** "Who is the cheapest qualified supplier, and what would the annual spend be?"

**Expected:** BRK_0030 (Ulmbrook Rail Braking s.r.o.) at EUR 128.24. 30,000 x EUR 128.24 = EUR 3,847,200 per year.

**Jury should notice:** a price-only process would stop here and award BRK_0030. Pause on this before the next step.

### 5. Risk gate and award (the key moment)

**Ask:** "Apply our risk gate, Total Risk Index below 50 and Financial Health Score below 50, and recommend an award."

**Expected:** BRK_0030 fails (Total Risk Index 58 High, Financial Health 79 Critical) and BRK_0049 fails (83 Critical,
90 Critical). Award to BRK_0046 (Rendavo Railway Brakes SAS, France, Approved) at EUR 138.27, Total Risk Index 34,
Financial Health 38. Annual spend EUR 4,148,100.

**Jury should notice:** the cheapest qualified supplier is in Critical financial health. Risk data changes the
decision; this is what the product is about.

### 6. Cost of the risk gate

**Ask:** "What does the risk gate cost us per year?"

**Expected:** (EUR 138.27 - EUR 128.24) x 30,000 = EUR 300,900 per year.

**Jury should notice:** the agent turns a risk decision into a number a CFO can weigh: about 7.8% more spend to avoid
a supplier at risk of failing.

### 7. Dual sourcing 70/30

**Ask:** "For resilience, split it 70/30 between the two cheapest suppliers that pass the gate. Who gets what, and what
does it cost?"

**Expected:** 21,000 units to BRK_0046 (EUR 2,903,670) and 9,000 units to BRK_0058 (EUR 1,665,990). Total
EUR 4,569,660, which is EUR 421,560 more than single-sourcing from BRK_0046. BRK_0058 is a prospect with no order
history and must be onboarded first.

**Jury should notice:** the agent flags, unprompted, that the backup supplier is not yet approved.

### 8. Risk briefing on the winner

**Ask:** "Give me a short risk briefing on BRK_0046 before we negotiate."

**Expected:** Approved supplier in France. Total Risk Index 34 (Medium). Highest risk areas: External Intelligence 51
(High), Media Sentiment 49 (Medium), Governance Risk 42 (Medium). Certifications ISO 9001, ISO/TS 22163, ISO 14001,
ISO 45001. Delivery rating 95.21%. MOQ 800 units fits a monthly call-off of 2,500.

**Jury should notice:** even the chosen supplier has a watch point (External Intelligence is High), which gives the
buyer a concrete topic for the negotiation.

### 9. Deliberate refusal

**Ask:** "What is the landed cost per unit from BRK_0046, including freight and import duties?"

**Expected:** the agent says it cannot calculate this: the database holds quoted unit prices only, with no freight
rates, Incoterms or duties. It offers the unit price and annual spend instead, and gives no estimate.

**Jury should notice:** the agent does not invent numbers. It is clear about what it knows and what it does not.

---

## Presenter notes

- Ask the questions in this order and in one conversation; later steps rely on the earlier ones.
- If the agent's wording differs, check the supplier IDs and amounts: those are what matter.
- If the agent picks a different winner in step 5, check that the risk gate was stated exactly as above.
- Rehearse once on the live stack before the demo. The numbers here are verified against the CSVs and the local
  database, not yet against the MCP agent itself.
