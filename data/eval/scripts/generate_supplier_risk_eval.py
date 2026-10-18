"""Generate the offline evaluation dataset for the supplier risk chatbot.

Reads the mock supplier risk CSV and produces procurement-style questions with
ground truth computed directly from the data. Output is deterministic for a
given seed, so the dataset can be regenerated and audited.

Usage:
    python3 data/eval/scripts/generate_supplier_risk_eval.py \
        --source data/eval/source/supplier_risk_data.csv \
        --out data/eval/supplier_risk_eval_v1 \
        --seed 42

Standard library only.
"""

import argparse
import csv
import json
import random
import statistics
from pathlib import Path

# Field metadata: (display label, natural-language phrase used in questions)
SCORE_FIELDS = {
    "Financial_Health_Score": ("Financial Health Score", "financial risk"),
    "Credit_Rating_Score": ("Credit Rating Score", "credit risk"),
    "Compliance_Risk_Score": ("Compliance Risk Score", "legal and compliance risk"),
    "Quality_Risk_Score": ("Quality Risk Score", "quality risk"),
    "Digital_Security_Score": ("Digital Security Score", "cyber security risk"),
    "Labor_Stability_Score": ("Labor Stability Score", "labor disruption risk"),
    "Safety_Incident_Score": ("Safety Incident Score", "safety risk"),
    "Environmental_Exposure_Score": ("Environmental Exposure Score", "natural hazard exposure"),
    "ESG_Performance_Score": ("ESG Performance Score", "ESG risk"),
    "Operational_Resilience_Score": ("Operational Resilience Score", "operational risk"),
    "Market_Sentiment_Score": ("Market Sentiment Score", "reputational risk"),
    "Governance_Risk_Score": ("Governance Risk Score", "governance risk"),
    "Geopolitical_Risk_Score": ("Geopolitical Risk Score", "geopolitical risk"),
    "Political_Stability_Score": ("Political Stability Score", "political instability risk"),
    "Sub_Tier_Visibility_Score": ("Sub-Tier Visibility Score", "sub-tier supply chain risk"),
    "Media_Sentiment_Score": ("Media Sentiment Score", "adverse media risk"),
    "External_Intelligence_Score": ("External Intelligence Score", "third-party intelligence risk"),
    "Industry_Benchmark_Score": ("Industry Benchmark Score", "risk relative to industry peers"),
}
TRI = "Total_Risk_Index"
ALL_SCORES = {TRI: ("Total Risk Index", "overall risk"), **SCORE_FIELDS}

# Fields procurement users ask about most often get more weight when sampling.
FIELD_WEIGHTS = {
    "Financial_Health_Score": 5, "Credit_Rating_Score": 3, "Quality_Risk_Score": 4,
    "Compliance_Risk_Score": 3, "Digital_Security_Score": 3, "Geopolitical_Risk_Score": 3,
    "ESG_Performance_Score": 3, "Labor_Stability_Score": 2, "Operational_Resilience_Score": 2,
}

PO = "Purchase Order Volume (EUR)"
OCR = "Order Change Rate"
SDR = "Supplier Delivery Rating"
OCF = "Order Confirmation Rate"
SRL = "Sourcing Risk Level"
SCC = "Supply Chain Complexity"
LEVELS = ["Low", "Medium", "High", "Critical"]
LEVEL_BANDS = {"Low": "0-24", "Medium": "25-49", "High": "50-74", "Critical": "75-100"}


def level_of(score):
    if score >= 75:
        return "Critical"
    if score >= 50:
        return "High"
    if score >= 25:
        return "Medium"
    return "Low"


def eur(v):
    return f"EUR {v:,.2f}"


def load(path):
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            for k in ALL_SCORES:
                r[k] = int(r[k])
            for k in (PO, OCR, SDR, OCF):
                r[k] = float(r[k])
            rows.append(r)
    # Sanity check: level columns agree with the documented bands.
    for r in rows:
        for k in ALL_SCORES:
            assert r[f"{k}_Level"] == level_of(r[k]), (r["supplierID"], k)
    return rows


class Generator:
    def __init__(self, rows, seed):
        self.rows = rows
        self.by_id = {r["supplierID"]: r for r in rows}
        self.rng = random.Random(seed)
        self.items = []
        self.seen = set()
        self.median = {k: statistics.median(r[k] for r in rows) for k in (PO, OCR, SDR, OCF)}

    # ---------- helpers ----------
    def pick_field(self, pool=None):
        pool = pool or list(SCORE_FIELDS)
        weights = [FIELD_WEIGHTS.get(f, 1) for f in pool]
        return self.rng.choices(pool, weights=weights, k=1)[0]

    def ref(self, r, style=None):
        """How a supplier is referenced in a question: by ID, name, or both."""
        style = style or self.rng.choices(["id", "name", "both"], weights=[6, 2, 2])[0]
        if style == "id":
            return r["supplierID"]
        if style == "name":
            return r["Supplier Name"]
        return f"{r['Supplier Name']} ({r['supplierID']})"

    @staticmethod
    def tag(r):
        return f"{r['supplierID']} ({r['Supplier Name']})"

    @staticmethod
    def join(xs):
        xs = list(xs)
        return xs[0] if len(xs) == 1 else ", ".join(xs[:-1]) + " and " + xs[-1]

    def add(self, category, difficulty, question, answer, expected, method,
            supplier_ids=(), fields=(), key_points=None, tolerance=None):
        if question in self.seen:
            return False
        self.seen.add(question)
        ev = {"method": method}
        if key_points:
            ev["key_points"] = key_points
        if tolerance is not None:
            ev["tolerance"] = tolerance
        self.items.append({
            "id": f"SRE-{len(self.items) + 1:04d}",
            "category": category,
            "difficulty": difficulty,
            "question": question,
            "ground_truth_answer": answer,
            "expected": expected,
            "evaluation": ev,
            "supplier_ids": list(supplier_ids),
            "fields": list(fields),
        })
        return True

    def describe_filter(self, conds):
        return self.join(c["text"] for c in conds)

    def apply(self, conds, rows=None):
        rows = self.rows if rows is None else rows
        return [r for r in rows if all(c["fn"](r) for c in conds)]

    def random_condition(self, kind=None):
        kind = kind or self.rng.choice(["score_level", "sourcing", "complexity", "po", "delivery", "confirmation", "change"])
        if kind == "score_level":
            f = self.pick_field([TRI] + list(SCORE_FIELDS))
            lv = self.rng.choice([["Critical"], ["High", "Critical"], ["Low"]])
            txt_lv = "High or Critical" if len(lv) == 2 else lv[0]
            return {"text": f"a {txt_lv} {ALL_SCORES[f][0]}", "fn": lambda r, f=f, lv=lv: level_of(r[f]) in lv,
                    "spec": {"field": f, "levels": lv}}
        if kind == "sourcing":
            lv = self.rng.choice(["High", "Low"])
            return {"text": f"{lv} sourcing risk", "fn": lambda r, lv=lv: r[SRL] == lv, "spec": {"field": SRL, "eq": lv}}
        if kind == "complexity":
            lv = self.rng.choice(["Complex", "Simple"])
            return {"text": f"a {lv.lower()} supply chain", "fn": lambda r, lv=lv: r[SCC] == lv, "spec": {"field": SCC, "eq": lv}}
        if kind == "po":
            t = self.rng.choice([1_000_000, 5_000_000, 10_000_000, 20_000_000])
            return {"text": f"purchase order volume above EUR {t / 1e6:g}M", "fn": lambda r, t=t: r[PO] > t, "spec": {"field": PO, "gt": t}}
        if kind == "delivery":
            t = self.rng.choice([75, 80, 85])
            return {"text": f"a delivery rating below {t}%", "fn": lambda r, t=t: r[SDR] < t, "spec": {"field": SDR, "lt": t}}
        if kind == "confirmation":
            t = self.rng.choice([70, 75, 80])
            return {"text": f"an order confirmation rate below {t}%", "fn": lambda r, t=t: r[OCF] < t, "spec": {"field": OCF, "lt": t}}
        t = self.rng.choice([15, 20, 25])
        return {"text": f"an order change rate above {t}%", "fn": lambda r, t=t: r[OCR] > t, "spec": {"field": OCR, "gt": t}}

    # ---------- categories ----------
    def lookup(self, n):
        templates_score = [
            "What is the {label} of {ref}?",
            "Can you pull up the {label} for {ref}?",
            "What's {ref}'s current {phrase} score?",
            "How is {ref} rated on {phrase}?",
        ]
        templates_ops = [
            ("What is our total purchase order volume with {ref}?", PO),
            ("What's the delivery rating for {ref}?", SDR),
            ("How often does {ref} confirm orders on time?", OCF),
            ("What is the order change rate for {ref}?", OCR),
            ("How hard would it be to replace {ref}? What's their sourcing risk level?", SRL),
            ("How complex is the supply chain behind {ref}?", SCC),
        ]
        i = 0
        while i < n:
            r = self.rng.choice(self.rows)
            ref = self.ref(r)
            if i % 3 != 2:
                f = TRI if i % 4 == 0 else self.pick_field()
                label, phrase = ALL_SCORES[f]
                q = self.rng.choice(templates_score).format(label=label, phrase=phrase, ref=ref)
                ans = f"{self.tag(r)} has a {label} of {r[f]}, which is {r[f + '_Level']} risk (0 = no risk, 100 = maximum risk)."
                i += self.add("lookup", "easy", q, ans, {"value": r[f], "level": r[f + "_Level"]}, "exact_match",
                              [r["supplierID"]], [f])
            else:
                tpl, f = self.rng.choice(templates_ops)
                q = tpl.format(ref=ref)
                v = r[f]
                if f == PO:
                    ans, exp = f"Purchase order volume with {self.tag(r)} is {eur(v)}.", {"value": v}
                    method, tol = "numeric", {"abs": 0.01}
                elif f in (SDR, OCF, OCR):
                    ans, exp = f"{self.tag(r)} has {'an' if f[0] in 'AEIOU' else 'a'} {f} of {v:.2f}%.", {"value": v}
                    method, tol = "numeric", {"abs": 0.01}
                else:
                    ans, exp = f"{self.tag(r)} has a {f} of {v}.", {"value": v}
                    method, tol = "exact_match", None
                i += self.add("lookup", "easy", q, ans, exp, method, [r["supplierID"]], [f], tolerance=tol)

    def comparison(self, n):
        risk_tpl = [
            "Which of {refs} has the {dir} {phrase}?",
            "Between {refs}, which supplier carries the {dir} {phrase}?",
            "I'm shortlisting {refs} for a new contract. Which one has the {dir} {phrase}?",
            "Rank {refs} by {phrase}. Which comes out with the {dir}?",
        ]
        ops_specs = [
            (SDR, "highest", "Which of {refs} has the best delivery performance?"),
            (SDR, "lowest", "Which of {refs} is the least reliable on delivery?"),
            (OCF, "highest", "Out of {refs}, which supplier is best at confirming orders on time?"),
            (OCR, "lowest", "Which of {refs} has the most stable order book (lowest order change rate)?"),
            (PO, "highest", "Which of {refs} do we spend the most with?"),
        ]
        made = 0
        while made < n:
            k = self.rng.choice([2, 3, 3, 3, 4])
            sample = self.rng.sample(self.rows, k)
            use_ops = made % 4 == 3
            if use_ops:
                f, direction, tpl = self.rng.choice(ops_specs)
            else:
                f = TRI if made % 6 == 0 else self.pick_field()
                direction = self.rng.choice(["lowest", "lowest", "highest"])
                tpl = self.rng.choice(risk_tpl)
            vals = sorted(sample, key=lambda r: r[f], reverse=(direction == "highest"))
            if abs(vals[0][f] - vals[1][f]) < 2:  # require an unambiguous winner
                continue
            refs = self.join(self.ref(r, "id" if self.rng.random() < 0.8 else "both") for r in sample)
            best = vals[0]
            if use_ops:
                q = tpl.format(refs=refs)
                fmt = (lambda v: eur(v)) if f == PO else (lambda v: f"{v:.2f}%")
                detail = "; ".join(f"{r['supplierID']}: {fmt(r[f])}" for r in sample)
                ans = f"{self.tag(best)}, with a {f} of {fmt(best[f])}. Values: {detail}."
            else:
                label, phrase = ALL_SCORES[f]
                q = tpl.format(refs=refs, dir=direction, phrase=phrase)
                detail = "; ".join(f"{r['supplierID']}: {r[f]} ({r[f + '_Level']})" for r in sample)
                ans = (f"{self.tag(best)} has the {direction} {phrase}, with a {label} of {best[f]} "
                       f"({best[f + '_Level']}). Scores: {detail}. Lower scores mean lower risk.")
            made += self.add("comparison", "easy" if k == 2 else "medium", q, ans,
                     {"answer_id": best["supplierID"], "values": {r["supplierID"]: r[f] for r in sample}},
                     "exact_match_id", [r["supplierID"] for r in sample], [f])

    def multi_dim_comparison(self, n):
        dim_sets = [
            (["Financial_Health_Score", "Quality_Risk_Score"], SDR, "financial health, quality and delivery reliability"),
            (["Compliance_Risk_Score", "ESG_Performance_Score"], OCF, "compliance, ESG and order confirmation"),
            (["Digital_Security_Score", "Operational_Resilience_Score"], SDR, "cyber security, operational resilience and delivery"),
            (["Credit_Rating_Score", "Geopolitical_Risk_Score"], OCF, "credit, geopolitical exposure and order confirmation"),
        ]
        tpls = [
            "Compare {a} and {b} on {desc}. Which would you award the contract to?",
            "We need to pick one of {a} or {b} for a dual-source setup. How do they compare on {desc}?",
            "Give me a side-by-side of {a} vs {b} on {desc}, and tell me which is the safer choice.",
        ]
        made = 0
        while made < n:
            scores, ops, desc = dim_sets[made % len(dim_sets)]
            a, b = self.rng.sample(self.rows, 2)
            # pick pairs where one supplier is better on every requested dimension
            a_wins = all(a[s] < b[s] - 2 for s in scores) and a[ops] > b[ops] + 1
            b_wins = all(b[s] < a[s] - 2 for s in scores) and b[ops] > a[ops] + 1
            if not (a_wins or b_wins):
                continue
            w, l = (a, b) if a_wins else (b, a)
            parts = [f"{SCORE_FIELDS[s][0]}: {w['supplierID']} {w[s]} vs {l['supplierID']} {l[s]}" for s in scores]
            parts.append(f"{ops}: {w['supplierID']} {w[ops]:.2f}% vs {l['supplierID']} {l[ops]:.2f}%")
            ans = (f"{self.tag(w)} is the stronger choice; it is better on all three dimensions. "
                   + "; ".join(parts) + f". Overall Total Risk Index: {w['supplierID']} {w[TRI]} ({w[TRI + '_Level']}) "
                   f"vs {l['supplierID']} {l[TRI]} ({l[TRI + '_Level']}).")
            kp = [f"Recommends {w['supplierID']}"] + [f"Reports {p}" for p in parts]
            q = self.rng.choice(tpls).format(a=self.ref(a, "id"), b=self.ref(b, "id"), desc=desc)
            made += self.add("multi_dim_comparison", "medium", q, ans,
                     {"answer_id": w["supplierID"], "dimensions": scores + [ops]}, "rubric",
                     [a["supplierID"], b["supplierID"]], scores + [ops, TRI], key_points=kp)

    def explain_tri(self, n_high, n_low):
        high_tpl = [
            "Why is the Total Risk Index of {ref} so high?",
            "{ref} just got flagged as {lv} overall. What's driving that?",
            "Can you break down what's behind {ref}'s overall risk score of {tri}?",
            "Our dashboard shows {ref} at a Total Risk Index of {tri}. Which risk categories are pushing it up?",
            "What are the main risk drivers for {ref}?",
        ]
        low_tpl = [
            "Why is {ref}'s Total Risk Index so low?",
            "{ref} scores only {tri} on the Total Risk Index. What makes it a low-risk supplier?",
        ]
        high_pool = [r for r in self.rows if r[TRI] >= 72]
        low_pool = [r for r in self.rows if r[TRI] <= 20]
        for r in self.rng.sample(high_pool, n_high) + self.rng.sample(low_pool, n_low):
            high = r[TRI] >= 50
            comps = sorted(SCORE_FIELDS, key=lambda f: r[f], reverse=high)
            # drivers: all Critical (or Low for low-TRI) categories, at least 3, at most 5
            extreme = "Critical" if high else "Low"
            drivers = [f for f in comps if r[f + "_Level"] == extreme][:5]
            if len(drivers) < 3:
                drivers = comps[:3]
            counter_lv = ("High", "Critical") if high else ("Low", "Medium")
            n_elev = sum(1 for f in SCORE_FIELDS if r[f + "_Level"] in counter_lv)
            offsets = sorted(SCORE_FIELDS, key=lambda f: r[f], reverse=not high)[:2]
            dtxt = ", ".join(f"{SCORE_FIELDS[f][0]} {r[f]} ({r[f + '_Level']})" for f in drivers)
            otxt = ", ".join(f"{SCORE_FIELDS[f][0]} {r[f]}" for f in offsets)
            if high:
                ans = (f"{self.tag(r)} has a Total Risk Index of {r[TRI]} ({r[TRI + '_Level']}). The index is a weighted "
                       f"aggregate of 18 risk categories, and {n_elev} of them are High or Critical. The biggest "
                       f"drivers are {dtxt}. The lowest-scoring categories ({otxt}) are not enough to offset these.")
                tpl = self.rng.choice(high_tpl)
            else:
                ans = (f"{self.tag(r)} has a Total Risk Index of {r[TRI]} ({r[TRI + '_Level']}). {n_elev} of 18 risk "
                       f"categories are Low or Medium. The strongest areas are {dtxt}. Its weakest categories are "
                       f"{otxt}, but these are outweighed by the rest.")
                tpl = self.rng.choice(low_tpl)
            kp = [f"States Total Risk Index {r[TRI]} ({r[TRI + '_Level']})",
                  "Names at least three of: " + ", ".join(SCORE_FIELDS[f][0] for f in drivers),
                  "Explains that the index aggregates multiple risk categories",
                  "Does not invent drivers outside the dataset (e.g., news events, countries)"]
            self.add("explanation", "hard", tpl.format(ref=self.ref(r), lv=r[TRI + "_Level"], tri=r[TRI]), ans,
                     {"tri": r[TRI], "level": r[TRI + "_Level"],
                      "top_drivers": [{"field": f, "score": r[f], "level": r[f + "_Level"]} for f in drivers],
                      "n_categories_elevated": n_elev},
                     "rubric", [r["supplierID"]], [TRI] + drivers, key_points=kp)

    def profile(self, n):
        tpls = [
            "I have a negotiation with {ref} next week. Give me a quick risk briefing.",
            "Summarise the risk profile of {ref}.",
            "Should we be worried about {ref}? What are the red flags?",
            "Prepare a one-paragraph supplier risk summary for {ref} for our quarterly business review.",
        ]
        for r in self.rng.sample(self.rows, n):
            crit = [f for f in SCORE_FIELDS if r[f + "_Level"] == "Critical"]
            high = [f for f in SCORE_FIELDS if r[f + "_Level"] == "High"]
            crit_txt = ", ".join(f"{SCORE_FIELDS[f][0]} ({r[f]})" for f in crit) or "none"
            ans = (f"{self.tag(r)}: Total Risk Index {r[TRI]} ({r[TRI + '_Level']}). Critical categories: {crit_txt}. "
                   f"{len(high)} further categories are High. Operationally: purchase order volume {eur(r[PO])}, "
                   f"delivery rating {r[SDR]:.2f}%, order confirmation rate {r[OCF]:.2f}%, order change rate {r[OCR]:.2f}%. "
                   f"Sourcing risk level is {r[SRL]} and supply chain complexity is {r[SCC]}.")
            kp = [f"States Total Risk Index {r[TRI]} ({r[TRI + '_Level']})",
                  ("Lists Critical categories: " + ", ".join(SCORE_FIELDS[f][0] for f in crit)) if crit
                  else "Correctly states there are no Critical categories",
                  f"Mentions sourcing risk level {r[SRL]}",
                  f"Mentions at least two operational KPIs correctly (PO {eur(r[PO])}, delivery {r[SDR]:.2f}%, confirmation {r[OCF]:.2f}%)"]
            self.add("risk_profile", "medium", self.rng.choice(tpls).format(ref=self.ref(r)), ans,
                     {"tri": r[TRI], "critical_fields": crit, "high_fields": high, "sourcing_risk": r[SRL]},
                     "rubric", [r["supplierID"]], [TRI] + crit + [PO, SDR, OCF, OCR, SRL, SCC], key_points=kp)

    def top_n(self, n):
        sorts = [
            (PO, True, "the largest purchase order volume", "spend"),
            (SDR, False, "the worst delivery rating", "delivery"),
            (OCF, False, "the lowest order confirmation rate", "confirmation"),
            (OCR, True, "the highest order change rate", "change"),
        ]
        tpls = [
            "List the top {k} suppliers by {sort} that have {flt}.",
            "Which {k} suppliers with {flt} have {sort}?",
            "Among suppliers with {flt}, show me the {k} with {sort}.",
        ]
        made = 0
        while made < n:
            key, desc, sort_txt, _ = self.rng.choice(sorts)
            conds = [self.random_condition("score_level")]
            if self.rng.random() < 0.5:
                conds.append(self.random_condition(self.rng.choice(["sourcing", "complexity"])))
            k = self.rng.choice([3, 5, 10])
            pool = sorted(self.apply(conds), key=lambda r: r[key], reverse=desc)
            if len(pool) <= k or pool[k - 1][key] == pool[k][key]:
                continue
            top = pool[:k]
            fmt = (lambda v: eur(v)) if key == PO else (lambda v: f"{v:.2f}%")
            q = self.rng.choice(tpls).format(k=k, sort=sort_txt, flt=self.describe_filter(conds))
            ans = (f"{len(pool)} suppliers have {self.describe_filter(conds)}. The top {k} by {key} are: "
                   + "; ".join(f"{i + 1}. {self.tag(r)} {fmt(r[key])}" for i, r in enumerate(top)) + ".")
            made += self.add("portfolio_ranking", "hard", q, ans,
                     {"ids_ordered": [r["supplierID"] for r in top], "filter": [c["spec"] for c in conds],
                      "sort": {"field": key, "descending": desc}, "pool_size": len(pool)},
                     "set_match", [r["supplierID"] for r in top], [c["spec"]["field"] for c in conds] + [key])

    def count(self, n):
        tpls = [
            "How many suppliers have {flt}?",
            "How many of our suppliers currently show {flt}?",
            "Give me a count of suppliers with {flt}.",
        ]
        fixed = [
            [{"text": "a Critical Total Risk Index", "fn": lambda r: r[TRI + "_Level"] == "Critical", "spec": {"field": TRI, "levels": ["Critical"]}}],
        ]
        made = 0
        for conds in fixed:
            self._add_count(conds, tpls)
            made += 1
        while made < n:
            k = self.rng.choice([1, 2, 2, 3])
            kinds = self.rng.sample(["score_level", "score_level", "sourcing", "complexity", "po", "delivery", "confirmation"], k)
            conds = [self.random_condition(kd) for kd in kinds]
            if len({c["spec"]["field"] for c in conds}) < len(conds):
                continue
            if not self.apply(conds):
                continue
            self._add_count(conds, tpls)
            made += 1

    def _add_count(self, conds, tpls):
        res = self.apply(conds)
        q = self.rng.choice(tpls).format(flt=self.describe_filter(conds))
        ans = f"{len(res)} suppliers have {self.describe_filter(conds)}."
        self.add("count", "medium" if len(conds) > 1 else "easy", q, ans,
                 {"value": len(res), "filter": [c["spec"] for c in conds]}, "exact_match",
                 [], [c["spec"]["field"] for c in conds])

    def aggregation(self, n):
        made = 0
        while made < n:
            mode = ["sum_po", "share_po", "avg_metric"][made % 3]
            conds = [self.random_condition(self.rng.choice(["score_level", "score_level", "sourcing", "complexity"]))]
            if self.rng.random() < 0.4:
                extra = self.random_condition(self.rng.choice(["sourcing", "complexity"]))
                if extra["spec"]["field"] != conds[0]["spec"]["field"]:
                    conds.append(extra)
            res = self.apply(conds)
            if len(res) < 5:
                continue
            flt = self.describe_filter(conds)
            if mode == "sum_po":
                v = round(sum(r[PO] for r in res), 2)
                q = self.rng.choice([f"What is our total purchase order volume with suppliers that have {flt}?",
                                     f"How much spend (EUR) is exposed to suppliers with {flt}?"])
                ans = f"Total purchase order volume across the {len(res)} suppliers with {flt} is {eur(v)}."
                tol = {"rel": 0.005}
            elif mode == "share_po":
                total = sum(r[PO] for r in self.rows)
                v = round(100 * sum(r[PO] for r in res) / total, 2)
                q = f"What share of our total spend sits with suppliers that have {flt}?"
                ans = f"{v:.2f}% of total purchase order volume ({len(res)} suppliers) sits with suppliers that have {flt}."
                tol = {"abs": 0.1}
            else:
                metric = self.rng.choice([SDR, OCF, OCR])
                v = round(statistics.mean(r[metric] for r in res), 2)
                q = f"What is the average {metric.lower()} for suppliers with {flt}?"
                ans = (f"The average {metric} across the {len(res)} suppliers with {flt} is {v:.2f}% "
                       f"(portfolio median: {self.median[metric]:.2f}%).")
                tol = {"abs": 0.1}
            made += self.add("aggregation", "hard", q, ans,
                     {"value": v, "n_suppliers": len(res), "filter": [c["spec"] for c in conds]},
                     "numeric", [], [c["spec"]["field"] for c in conds] + [PO], tolerance=tol)

    def screening(self, n):
        tpls = [
            "List all suppliers with {flt}.",
            "Which suppliers have {flt}? We need them on the watchlist.",
            "Flag every supplier that has {flt}.",
        ]
        made = 0
        while made < n:
            kinds = self.rng.sample(["score_level", "score_level", "sourcing", "complexity", "po", "delivery", "confirmation", "change"], 3)
            conds = [self.random_condition(kd) for kd in kinds]
            if len({c["spec"]["field"] for c in conds}) < 3:
                continue
            res = self.apply(conds)
            if not 1 <= len(res) <= 12:
                continue
            ids = sorted(r["supplierID"] for r in res)
            q = self.rng.choice(tpls).format(flt=self.describe_filter(conds))
            ans = f"{len(ids)} supplier(s) match: " + ", ".join(self.tag(self.by_id[i]) for i in ids) + "."
            made += self.add("screening", "hard", q, ans, {"ids": ids, "filter": [c["spec"] for c in conds]},
                     "set_match", ids, [c["spec"]["field"] for c in conds])

    def alternatives(self, n):
        tpls = [
            "{ref} has Critical {phrase}. Recommend 3 alternative suppliers with Low {phrase}, Low sourcing risk "
            "and a delivery rating of at least {d}%, prioritising the lowest Total Risk Index.",
            "We want to move volume away from {ref} because of its {phrase}. Which 3 suppliers with Low {phrase}, "
            "Low sourcing risk and delivery rating of {d}% or better have the lowest overall risk?",
        ]
        made = 0
        while made < n:
            f = self.pick_field()
            src = self.rng.choice([r for r in self.rows if r[f + "_Level"] == "Critical"])
            d = self.rng.choice([90, 95])
            pool = [r for r in self.rows if r[f + "_Level"] == "Low" and r[SRL] == "Low" and r[SDR] >= d
                    and r["supplierID"] != src["supplierID"]]
            pool.sort(key=lambda r: r[TRI])
            if len(pool) <= 3 or pool[2][TRI] == pool[3][TRI]:
                continue
            top = pool[:3]
            label, phrase = SCORE_FIELDS[f]
            q = self.rng.choice(tpls).format(ref=self.ref(src), phrase=phrase, d=d)
            ans = (f"{self.tag(src)} has a {label} of {src[f]} (Critical). Of the {len(pool)} suppliers meeting the "
                   f"criteria, the three with the lowest Total Risk Index are: "
                   + "; ".join(f"{self.tag(r)} (TRI {r[TRI]}, {label} {r[f]}, delivery {r[SDR]:.2f}%)" for r in top) + ".")
            made += self.add("alternatives", "hard", q, ans,
                     {"ids_ordered": [r["supplierID"] for r in top], "source_id": src["supplierID"], "pool_size": len(pool)},
                     "set_match", [src["supplierID"]] + [r["supplierID"] for r in top], [f, SRL, SDR, TRI])

    def interpretation(self, n):
        made = 0
        while made < n:
            mode = made % 4
            if mode in (0, 1):
                f = self.pick_field()
                lv = "Critical" if mode == 0 else "Low"
                r = self.rng.choice([x for x in self.rows if x[f + "_Level"] == lv])
                label = SCORE_FIELDS[f][0]
                q = self.rng.choice([f"{r['supplierID']} has a {label} of {r[f]}. Is that a good sign?",
                                     f"Is a {label} of {r[f]} for {r['supplierID']} something to worry about?"])
                good = lv == "Low"
                ans = (f"{'Yes' if good else 'No'}. All scores in the dataset are risk scores where 0 = no risk and "
                       f"100 = maximum risk, so {r[f]} is {lv} risk{' and favourable' if good else ', a red flag'}. "
                       f"A higher {label} always means higher risk.")
                kp = [f"Classifies {r[f]} as {lv}", "States that higher scores mean higher risk"]
                self.add("interpretation", "medium", q, ans, {"level": lv, "is_good": good}, "rubric",
                         [r["supplierID"]], [f], key_points=kp)
            elif mode == 2:
                f = self.rng.choice(["Financial_Health_Score", "ESG_Performance_Score", "Labor_Stability_Score",
                                     "Political_Stability_Score", "Credit_Rating_Score"])
                label = SCORE_FIELDS[f][0]
                q = f"For the {label}, is a higher number better or worse?"
                ans = (f"Worse. Every score in the dataset is a risk score (0 = no risk, 100 = maximum risk), so a "
                       f"higher {label} means higher risk. Bands: Low 0-24, Medium 25-49, High 50-74, Critical 75-100.")
                self.add("interpretation", "easy", q, ans, {"higher_is": "worse"}, "rubric", [], [f],
                         key_points=["Says higher is worse / higher risk", "Does not interpret it as a health or performance score"])
            else:
                v = self.rng.choice([24, 25, 49, 50, 74, 75])
                q = f"What risk level does a score of {v} correspond to?"
                lv = level_of(v)
                ans = f"{v} falls in the {lv} band ({LEVEL_BANDS[lv]}). Bands: Low 0-24, Medium 25-49, High 50-74, Critical 75-100."
                self.add("interpretation", "easy", q, ans, {"level": lv}, "exact_match", [], [])
            made += 1

    def due_diligence(self, n):
        specs = [
            (["Labor_Stability_Score", "ESG_Performance_Score"], "both", "High or Critical risk on both labor stability and ESG performance"),
            (["Compliance_Risk_Score", "Governance_Risk_Score"], "any", "a Critical score on either compliance or governance"),
            (["Safety_Incident_Score", "Labor_Stability_Score"], "both", "High or Critical risk on both safety incidents and labor stability"),
            (["Sub_Tier_Visibility_Score", "ESG_Performance_Score"], "both", "a Critical sub-tier visibility score and High or Critical ESG risk"),
        ]
        tpls = [
            "For our supply chain due diligence reporting (LkSG / CSDDD), which of our top {k} suppliers by spend show {desc}?",
            "Human rights and environmental due diligence check: among the top {k} suppliers by purchase order volume, which have {desc}?",
        ]
        by_spend = sorted(self.rows, key=lambda r: r[PO], reverse=True)
        made = attempts = 0
        while made < n:
            attempts += 1
            assert attempts < 10_000, "due_diligence: could not find enough answerable questions"
            fields, mode, desc = specs[made % len(specs)]
            k = self.rng.choice([25, 30, 50, 100, 200])
            if by_spend[k - 1][PO] == by_spend[k][PO]:
                continue
            top = by_spend[:k]
            if mode == "any":
                fn = lambda r: any(r[f + "_Level"] == "Critical" for f in fields)
            elif fields[0] == "Sub_Tier_Visibility_Score":
                fn = lambda r: r[fields[0] + "_Level"] == "Critical" and r[fields[1] + "_Level"] in ("High", "Critical")
            else:
                fn = lambda r: all(r[f + "_Level"] in ("High", "Critical") for f in fields)
            res = [r for r in top if fn(r)]
            if not 1 <= len(res) <= 20:
                continue
            ids = sorted(r["supplierID"] for r in res)
            q = self.rng.choice(tpls).format(k=k, desc=desc)
            ans = (f"{len(ids)} of the top {k} suppliers by spend show {desc}: "
                   + "; ".join(f"{self.tag(r)} ({', '.join(f'{SCORE_FIELDS[f][0]} {r[f]}' for f in fields)})"
                               for r in sorted(res, key=lambda r: r['supplierID'])) + ".")
            made += self.add("due_diligence", "hard", q, ans, {"ids": ids, "top_k_by_spend": k}, "set_match",
                     ids, fields + [PO])

    def kpi_benchmark(self, n):
        made = 0
        while made < n:
            r = self.rng.choice(self.rows)
            m = self.rng.choice([SDR, OCF, OCR, PO])
            med = self.median[m]
            pct = round(100 * sum(1 for x in self.rows if x[m] < r[m]) / len(self.rows), 1)
            fmt = (lambda v: eur(v)) if m == PO else (lambda v: f"{v:.2f}%")
            q = self.rng.choice([f"How does {self.ref(r)}'s {m.lower()} compare to the rest of our supplier base?",
                                 f"Is {self.ref(r)} above or below the portfolio median on {m.lower()}?"])
            pos = "above" if r[m] > med else "below" if r[m] < med else "equal to"
            better = {SDR: r[m] > med, OCF: r[m] > med, OCR: r[m] < med, PO: None}[m]
            judge = "" if better is None else (" This is better than typical." if better else " This is worse than typical.")
            ans = (f"{self.tag(r)} has {'an' if m[0] in 'AEIOU' else 'a'} {m} of {fmt(r[m])}, {pos} the portfolio median of {fmt(med)} "
                   f"(higher than {pct}% of suppliers).{judge}")
            made += self.add("kpi_benchmark", "medium", q, ans,
                     {"value": r[m], "median": med, "position": pos, "percentile": pct}, "rubric",
                     [r["supplierID"]], [m],
                     key_points=[f"Reports value {fmt(r[m])}", f"States it is {pos} the median ({fmt(med)})"])

    def unanswerable(self):
        r = lambda: self.rng.choice(self.rows)
        cases = [
            (f"Which country is {r()['supplierID']} headquartered in?", "location / country"),
            (f"What is the contracted lead time for {r()['supplierID']}?", "lead times"),
            (f"How has {r()['supplierID']}'s Total Risk Index changed over the past 12 months?", "historical trends (single snapshot only)"),
            (f"What commodity category does {r()['Supplier Name']} supply?", "commodity / category"),
            (f"Who is our account manager at {r()['Supplier Name']}?", "contacts"),
            (f"What was {r()['supplierID']}'s annual revenue last year?", "supplier revenue"),
            (f"What are the Scope 3 CO2 emissions in tonnes for {r()['supplierID']}?", "emissions figures (only an ESG risk score is available)"),
            (f"When does our framework contract with {r()['supplierID']} expire?", "contract terms"),
            ("What is the Total Risk Index of SUPP_10437?", "supplier SUPP_10437 (IDs run from SUPP_00001 to SUPP_10000)"),
            ("Show me the risk profile for Acme Corporation.", "a supplier named Acme Corporation"),
            (f"Which specific news articles caused the Media Sentiment Score of {r()['supplierID']}?", "underlying news sources"),
            (f"What payment terms do we have with {r()['supplierID']}?", "payment terms"),
        ]
        for q, missing in cases:
            ans = (f"This information is not in the supplier risk dataset ({missing}). The assistant should say so and "
                   f"not guess. It may offer related fields that are available.")
            self.add("unanswerable", "medium", q, ans, {"answerable": False, "missing": missing}, "refusal", [], [],
                     key_points=["States the information is not available", "Does not fabricate a value"])
        # Partially answerable: prediction requests
        for _ in range(3):
            s = r()
            q = self.rng.choice([f"Will {s['supplierID']} go bankrupt next year?",
                                 f"Is {s['supplierID']} going to miss deliveries next quarter?"])
            ans = (f"The dataset cannot predict future events. Relevant current indicators for {self.tag(s)}: "
                   f"Financial Health Score {s['Financial_Health_Score']} ({s['Financial_Health_Score_Level']}), "
                   f"Credit Rating Score {s['Credit_Rating_Score']} ({s['Credit_Rating_Score_Level']}), "
                   f"delivery rating {s[SDR]:.2f}%.")
            self.add("unanswerable", "hard", q, ans, {"answerable": "partial"}, "rubric", [s["supplierID"]],
                     ["Financial_Health_Score", "Credit_Rating_Score", SDR],
                     key_points=["Says it cannot predict the outcome", "Cites current relevant scores correctly"])


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", default="data/eval/source/supplier_risk_data.csv")
    p.add_argument("--out", default="data/eval/supplier_risk_eval_v1")
    p.add_argument("--seed", type=int, default=42)
    a = p.parse_args()

    g = Generator(load(a.source), a.seed)
    g.lookup(15)
    g.comparison(25)
    g.multi_dim_comparison(8)
    g.explain_tri(n_high=16, n_low=4)
    g.profile(10)
    g.top_n(12)
    g.count(12)
    g.aggregation(12)
    g.screening(12)
    g.alternatives(8)
    g.interpretation(8)
    g.due_diligence(8)
    g.kpi_benchmark(8)
    g.unanswerable()

    out = Path(a.out)
    with open(out.with_suffix(".jsonl"), "w", encoding="utf-8") as f:
        for it in g.items:
            f.write(json.dumps(it, ensure_ascii=False) + "\n")
    with open(out.with_suffix(".csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "category", "difficulty", "question", "ground_truth_answer", "evaluation_method", "supplier_ids"])
        for it in g.items:
            w.writerow([it["id"], it["category"], it["difficulty"], it["question"], it["ground_truth_answer"],
                        it["evaluation"]["method"], ";".join(it["supplier_ids"])])
    print(f"Wrote {len(g.items)} items to {out.with_suffix('.jsonl')} and {out.with_suffix('.csv')}")


if __name__ == "__main__":
    main()
