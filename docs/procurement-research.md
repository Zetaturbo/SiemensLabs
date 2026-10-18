# Smart Supplier Selection: Architecture and Procurement Research

Research notes for the Siemens challenge "Smart Supplier Selection for Trains". This document covers the recommended chatbot architecture, the scoping decision on product types, the questions buyers are likely to ask, and the tool design derived from those questions.

> Status: draft. The tool parameters and profile weights must be validated against `risk_criteria_description.md` and the actual CSV columns, which were not reviewed when this was written.

---

## 1. Architecture summary

### Do we need a vector database?

No. The dataset is structured: 10,000 rows, one per supplier, with risk scores in columns. Typical questions ("which of these three has the lowest financial risk?") are exact lookups, filters, sorts and comparisons. Vector similarity search retrieves content that looks similar; it does not reliably filter or compare numeric values. A regular database plus LLM tool calling is simpler and more accurate.

### Recommended setup

| Layer | Choice | Notes |
|---|---|---|
| Storage | DuckDB (reads the CSV directly) or Postgres (Supabase / Neon) | Postgres is preferable if the deployed app needs logins, saved shortlists or concurrent users |
| Column semantics | `risk_criteria_description.md` in the chatbot system prompt | Small enough to include directly, so no retrieval step is needed |
| Data access | MCP server (or plain function tools) exposing a small set of query tools | Shared by the chatbot and the research agent |
| Chatbot | LLM with tool calling | Picks a tool, fills parameters, answers using the returned rows |
| Research agent | Separate agent with web search and fetch tools | Plans, searches, digs deeper on red flags, writes a report with sources |
| UI | Filter, rank and compare views reading the same database | The UI and chatbot always see the same data |

### How the tools work

Each tool is a thin wrapper around a simple, parameterized query. Tools are designed around **families of questions**, not individual questions, and each tool is generic within its family (for example, any column, operator and sort order). A read-only SQL tool acts as a fallback for questions the predefined tools do not cover.

### When a vector database would make sense

- Suppliers have long free-text fields (audit notes, descriptions) that users query in fuzzy terms.
- The research agent needs to cache and re-query a large number of crawled documents.

For purely columnar data, it adds complexity without improving accuracy.

---

## 2. Scoping decision: one product type or open?

**Decision: keep the platform and data open, and make the product type an input that changes how risk is weighted.**

### Reasoning

1. The dataset does not appear to contain a product category column (to be confirmed). Hard-coding the tool for one product type would not be supported by the data.
2. Product type strongly affects which risks matter. This is the core idea of the **Kraljic matrix** (Kraljic, 1983), a standard procurement framework that classifies purchases by **profit impact** and **supply risk** into four quadrants:

| Quadrant | Profit impact | Supply risk | Typical strategy | Rail example |
|---|---|---|---|---|
| Strategic | High | High | Deep partnership with the supplier | Traction systems, signalling |
| Bottleneck | Low | High | Secure supply (framework agreements, safety stock, second source) | Custom component with few qualified makers |
| Leverage | High | Low | Use competition to reduce cost | Standard high-volume materials |
| Non-critical | Low | Low | Manage for efficiency | Standard fasteners, consumables |

Sources:
- https://lightsource.ai/glossary/kraljic-matrix
- https://lapasar.com/glossary/kraljic-matrix
- https://artofprocurement.com/learn/the-kraljic-matrix

### Proposed feature: sourcing profiles

At the start of the flow, the buyer selects a sourcing profile, for example:

- **Safety-critical component** (brakes, bogies, signalling): quality, compliance and certification weighted highest.
- **Strategic high-value system**: financial stability and long-term viability weighted highest.
- **Standard commodity part** (fasteners, cables): price and delivery weighted highest.

Each profile applies different weights to the risk columns. The same supplier can rank very differently depending on the profile, which mirrors how real buyers reason.

**Demo idea:** show the same 20 suppliers ranked under two contrasting profiles to make the value clear within seconds.

**Implementation note:** profiles live in one config file used by both the UI ranking and the chatbot, so they never disagree.

---

## 3. What matters to rail buyers

Findings from rail procurement sources:

- Studies of rolling stock spare parts selection identify quality, cost, reliability and safety as key criteria.
  - https://penerbit.uthm.edu.my/periodicals/index.php/rmtb/article/download/18913/6241/116677
- A railway case study traced poor supplier performance to late deliveries and goods that did not meet specifications, and used multi-criteria methods (AHP for weighting, TOPSIS for ranking) to select suppliers.
  - https://doaj.org/article/c2664a015f9a4dfabecc0a9ddbe41062
- Deutsche Bahn's chief procurement officer has linked rolling stock procurement to significant delivery delays and high failure rates, and DB appraises suppliers against standard criteria.
  - https://www.railjournal.com/in_depth/seeking-efficiencies-with-smarter-procurement/

Additional context (to verify against dataset columns):

- German companies such as Siemens are subject to the Supply Chain Due Diligence Act (LkSG), so human rights and environmental compliance are part of supplier risk.
- Rail suppliers are typically expected to hold ISO/TS 22163, the rail quality management standard formerly known as IRIS.

**Takeaway:** the weighted multi-criteria approach used in the literature (weights per criterion, then a ranking) is exactly what the sourcing profiles implement, which gives the feature a credible methodological basis.

---

## 4. Question families

Organized by the buyer journey described in the brief: narrow the field, compare up to 20 suppliers, justify the final choice.

### 4.1 Screening (narrowing the field)
- "Show me suppliers with financial risk below X and no compliance flags."
- "Which suppliers in [country/region] have the lowest total risk?"
- "Exclude anyone in the top 10% for geopolitical risk."

### 4.2 Comparing a shortlist
- "Which of SUPP_00012, SUPP_00450 and SUPP_00731 has the lowest financial risk?"
- "Where do these five suppliers differ most?"
- "Who is the most balanced supplier, with no single risk dimension in the red?"

### 4.3 Explaining a score
- "Why is the Total Risk Index of SUPP_00018 so high?"
- "What are this supplier's biggest weaknesses compared with the average?"
- "Is this supplier's risk driven by one factor or spread across many?"

### 4.4 Trade-offs and what-if
- "If I weight delivery reliability twice as much, who wins?"
- "Which supplier has the best quality but is only slightly riskier financially?"
- "Find a backup supplier similar to SUPP_00450 but in a different region." (dual sourcing, relevant for bottleneck items)

### 4.5 Justifying the decision
- "Write a short memo explaining why I should pick SUPP_00012 over the others."
- "What risks should I mitigate in the contract if I choose this supplier?"

---

## 5. Tool design

| Question family | Tool | Description |
|---|---|---|
| Screening | `filter_suppliers(conditions, sort_by, limit)` | Parameterized filter and sort on any risk column |
| Comparing | `compare_suppliers(ids, columns?)` | Rows side by side, plus best and worst supplier per column |
| Explaining | `explain_supplier(id)` | Each risk score with dataset percentile and deviation from the mean, sorted by contribution to the total |
| Trade-offs | `rank_with_profile(ids or filters, profile or custom_weights)` | Recomputes a weighted score using a sourcing profile or custom weights and returns the new ranking |
| Alternatives | `find_similar(id, exclude_region?, max_risk?)` | Nearest neighbours on the risk score vector (simple Euclidean distance in SQL or pandas, no vector DB needed) |
| Context | `get_dataset_stats(column?)` | Averages, percentiles and distributions so answers can state "high compared to what" |
| Fallback | `run_sql(query)` | Read-only database user, row limit, for questions the other tools miss |
| Justification | No dedicated tool | The LLM writes the memo from the outputs of the tools above, keeping it grounded in data |

### Design notes

- **`explain_supplier` drives answer quality.** "Why is the score high" only gets a good answer when the LLM sees percentiles and the largest contributors, not just raw values. If the Total Risk Index is a known formula of other columns, encode that formula in the tool or system prompt.
- **Keep tools generic within a family.** A handful of tools should cover most questions.
- **Safety of the fallback.** `run_sql` must use a read-only user and enforce a row limit.

---

## 6. Next steps

1. Review `risk_criteria_description.md` and map each column to the question families and sourcing profiles.
2. Confirm whether the dataset contains category, region or compliance columns, and adjust tool parameters accordingly.
3. Define initial weights for each sourcing profile and validate them with the mentor.
4. Write 15 to 20 realistic buyer questions (including the two examples from the brief) and test which ones the tools cannot answer; use the gaps to decide which tool to add next.
