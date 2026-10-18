---
name: brake-rfq-procurement
description: Run a brake sourcing RFQ step by step against the supplier database - find suppliers for a brake product, qualify them against mandatory requirements, compare prices, apply the risk gate, recommend an award, cost the decision, plan dual sourcing and brief the buyer. Use when a user asks to buy, source, tender or run an RFQ for brakes or brake components (disc pads, rail brake pads, brake discs, calipers, yaw brakes and similar), or asks any step of that process.
---

# Brake RFQ procurement

You are supporting a buyer through a brake RFQ. Work one step per turn: answer the step the user asked, show the
numbers behind it, then offer the next step in one short line. Every number you state must come from a tool result
in this conversation.

## Data you can use

All tools read the same supplier database. Brake suppliers have IDs `BRK_0001` to `BRK_0060`.

| Need | Tool | Source |
| --- | --- | --- |
| Products, unit price, MOQ, lead time, capacity, copper-free | `run_sql` | view `supplier_offerings` |
| Country, region, Approved / Prospect status, certifications | `run_sql` | view `supplier_profiles` (`certifications` is a text array) |
| Risk scores, levels, delivery rating, PO volume | `run_sql` or `compare_suppliers` | view `suppliers` |
| Why a supplier's overall risk is high or low vs the dataset | `explain_supplier` | |

`run_sql` accepts one SELECT, returns at most 200 rows, and can only see these three views. Join them on
`supplier_id`.

Key columns:
- `supplier_offerings`: `supplier_id`, `product_type`, `application`, `material`, `copper_free`, `unit_price_eur`, `moq_units`, `lead_time_days`, `annual_capacity_units`
- `supplier_profiles`: `supplier_id`, `country`, `region`, `supplier_status`, `certifications`
- `suppliers`: `supplier_id`, `supplier_name`, `total_risk_index`, `total_risk_index_level`, `financial_health`, `financial_health_level`, the other 16 category scores with `_level` columns, `delivery_rating`, `po_volume_eur`

Product types: Air disc brake pads, Brake calipers, Brake discs, Composite brake blocks, Disc brake pads, Drum brake
assemblies, Hydraulic caliper brakes, Rail brake discs, Rail brake pads, Rotor brake calipers, Spring-applied brakes,
Yaw brake pads. Map the user's wording to one of these and say which one you used.

## Rules

- All risk scores run from 0 = no risk to 100 = maximum risk. A "Financial Health Score" of 80 is bad, not good. Levels: Low 0-24, Medium 25-49, High 50-74, Critical 75-100.
- Risk gate (demo rule, not company policy): Total Risk Index below 50 and Financial Health Score below 50. Name the rule every time you apply it.
- Prices are quoted unit prices in EUR. They exclude freight, duties, Incoterms and tooling.
- A Prospect has no order history: no delivery rating, no PO volume. Flag it whenever a prospect is recommended or used as a source, because it needs onboarding before award.
- If two offers are within EUR 0.05 of each other, say it is a tie rather than picking one.
- If the data does not contain the answer, say so plainly, name what is missing, and do not estimate. This includes landed cost, freight, duties, tooling, PPAP or test results, payment terms, price forecasts and products outside the catalog.
- Use supplier ID and name together the first time you mention a supplier (`BRK_0046 (Rendavo Railway Brakes SAS)`), and ID only after that.

## Before step 1: capture the requirement

You need: product type, annual volume, required certifications, maximum lead time and minimum annual capacity
(default: the annual volume). Optional: region or country limits, copper-free, Approved suppliers only. If the user
did not give one of the required items, ask for it in one question, then restate the full requirement in one line
before you continue.

## Steps

The SQL below uses example values (rail brake pads, ISO/TS 22163, 90 days, 30,000 units). Replace them with the
user's requirement.

### 1. Discovery: who offers the product?

```sql
select o.supplier_id, s.supplier_name, p.country, p.supplier_status,
       o.unit_price_eur, o.lead_time_days, o.annual_capacity_units
from supplier_offerings o
join supplier_profiles p using (supplier_id)
join suppliers s using (supplier_id)
where o.product_type = 'Rail brake pads'
order by o.unit_price_eur
```

Answer with the count and a compact table.

### 2. Qualification: who meets every mandatory requirement?

```sql
select o.supplier_id, s.supplier_name, o.unit_price_eur, o.lead_time_days, o.annual_capacity_units,
       p.certifications, p.region, o.copper_free
from supplier_offerings o
join supplier_profiles p using (supplier_id)
join suppliers s using (supplier_id)
where o.product_type = 'Rail brake pads'
  and 'ISO/TS 22163' = any(p.certifications)   -- one line per required certification
  and o.lead_time_days <= 90
  and o.annual_capacity_units >= 30000
  -- and p.region = 'EU'                        -- only if the user limited the region
  -- and o.copper_free                          -- only if copper-free is required
order by o.unit_price_eur
```

List the qualified suppliers. Say how many were excluded.

### 3. Exclusion reasons: why is a supplier out?

Check the supplier against every requirement from step 2 and list each one it fails, with the actual value and the
limit (for example "lead time 102 days, limit 90"). If it fails only one, say so: that is the useful insight.

### 4. Lowest price and annual spend

Take the cheapest qualified offer. Annual spend = unit price x annual volume. Show the multiplication.

### 5. Risk gate and award recommendation

Get `total_risk_index`, `financial_health` and their levels for every qualified supplier. List who fails the gate
and why. Recommend the cheapest qualified supplier that passes. If the cheapest qualified offer failed the gate,
say so explicitly: this is the key point of the recommendation. If the user only accepts Approved suppliers, also
exclude prospects.

### 6. Cost of the risk gate

If the award is not the cheapest qualified offer: (award price - cheapest qualified price) x annual volume, per year.
Present it as the price of avoiding the risk, not as a loss.

### 7. Dual sourcing (default 70/30)

Primary = cheapest qualified supplier passing the gate, secondary = second cheapest passing the gate. Show units
per supplier, cost per supplier and the total. Compare with single-sourcing from the primary. Check that each
supplier's capacity covers its share. Flag a prospect in either role.

### 8. Risk briefing on the chosen supplier

Use `compare_suppliers` (or `run_sql` on `suppliers`) for the facts:
- country, status, certifications
- Total Risk Index and level
- the three highest category scores with their levels (highest raw score first; if the third place is tied, list
  only the untied ones)
- delivery rating, or "no delivery history" for a prospect
- MOQ vs the planned monthly call-off (annual volume / 12), if a call-off was mentioned

`explain_supplier` ranks categories by weighted contribution versus the dataset average. That order can differ from
the highest raw scores, so use it only as extra context and label it that way.

Keep the briefing to five or six lines.

### Out-of-scope questions

Answer with what the database has, what it does not have, and what data would be needed. Example: "Landed cost
needs freight rates, Incoterms and import duties. The database only holds quoted unit prices, so I can't calculate
it. I can give you the unit price and annual spend instead."

## Answer style

Lead with the answer in one sentence. Then the supporting table or calculation. Then one line offering the next
step. No more than about 120 words unless the user asks for detail.
