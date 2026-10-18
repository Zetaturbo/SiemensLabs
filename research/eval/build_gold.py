"""Builds eval/gold.json: hand-labelled verifier cases and gold facts for the fixed evidence set.

    cd research && .venv/bin/python eval/build_gold.py

Every quote is cut out of the real page text by (start, end) phrases, so it is verbatim by construction, and the script
fails if a phrase is missing. The statements and labels are written by hand:

  verified     the quote fully supports the statement
  partial      the quote supports only part of it (the statement adds something the quote does not say)
  contradicted the quote says the opposite or different facts (another number, date or party)
  unsupported  the quote is real but does not address the statement

`anchors` are short phrases a good extractor should capture for that page set (scored as recall in eval_models.py).
"""

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EVIDENCE = ROOT / "eval" / "evidence"

# set name -> {"anchors": [...], "cases": [(label, statement, (start, end))]}
SPEC = {
    "news__wabtec": {
        "anchors": ["initiated legal action against competitor Wabtec", "federal court in Delaware", "divest the rail business acquired from GE Transportation"],
        "cases": [
            ("verified", "A lawsuit against Wabtec was filed in a federal court in Delaware on September 6, alleging it breached agreements from the 2019 acquisition of GE Transportation.",
             ("The lawsuit filed in a federal court in Delaware", "acquisition of the GE Transportation business.")),
            ("partial", "Progress Rail wants damages and the divestment of the GE Transportation business, and a court has already ruled in its favour.",
             ("Progress Rail is seeking damages", "acquired from GE Transportation.")),
            ("contradicted", "Wabtec accepted the allegations and agreed to settle the case.",
             ("We intend to aggressively defend", "in court.")),
            ("unsupported", "Wabtec was fined by the US Department of Justice over the acquisition.",
             ("Progress Rail is a competitor of Wabtec", "dominant in the US market.")),
        ],
    },
    "news__vossloh": {
        "anchors": ["won a contract for equipping the Norwegian rail network", "taken over the Dutch ETS Spoor", "Werdohl"],
        "cases": [
            ("verified", "Vossloh won a contract to equip the Norwegian rail network with switches and crossings for Bane NOR.",
             ("Railway supplier Vossloh has won a contract", "for Bane NOR.")),
            ("partial", "Vossloh won the Bane NOR contract worth at least 80 million and will also build a factory in Norway.",
             ("The order is worth at least 80 million", "over the total term.")),
            ("contradicted", "The Bane NOR deliveries will run until 2031.",
             ("Deliveries will run until 2029", "2029.")),
            ("unsupported", "Vossloh was fined for cartel behaviour in Germany.",
             ("International railway supplier Vossloh has taken over", "ETS Spoor.")),
        ],
    },
    "news__knorr-bremse": {
        "anchors": ["Sitz in München", "2,000 digital wagon systems to VTG Rail UK"],
        "cases": [
            ("verified", "Knorr-Bremse has its headquarters in Munich and is listed in the MDax.",
             ("Der Konzern hat seinen Sitz in München", "im MDax gelistet.")),
            ("partial", "Knorr-Bremse has more than 30,000 employees and made record profits in 2021.",
             ("Die mehr als 30.000 Mitarbeiter", "6,7 Milliarden Euro.")),
            ("contradicted", "Knorr-Bremse will deliver 5,000 digital wagon systems to VTG Rail UK.",
             ("Knorr-Bremse will deliver 2,000 digital wagon systems", "by 2029")),
            ("unsupported", "Knorr-Bremse announced a product recall of brake systems in 2025.",
             ("Mehr als 70 Unternehmen und Experten haben Stellung bezogen", "DCGK.")),
        ],
    },
    "company__knorr-bremse": {
        "anchors": ["released in both German and English", "KPMG", "partially deviated from this recommendation"],
        "cases": [
            ("verified", "Knorr-Bremse's sustainability report is released in both German and English.",
             ("The Sustainability Report has been released in both German and English.", "English.")),
            ("partial", "The non-financial statement was reviewed by KPMG, which found no errors.",
             ("The content of the non-financial statement was reviewed by KPMG", "ISAE 3000 (revised).")),
            ("contradicted", "Knorr-Bremse complied with every recommendation of the German Corporate Governance Code in 2025.",
             ("In the 2025 fiscal year the Company partially deviated", "partly deviate from it in 2026.")),
            ("unsupported", "Knorr-Bremse's sustainability report won an industry award.",
             ("The report is issued annually.", "annually.")),
        ],
    },
    "company__wabtec": {
        "anchors": ["disclosed for the first time its complete Scope 3 emissions", "more than 23,000 locomotives", "138 million metric tons"],
        "cases": [
            ("verified", "In its 2023 sustainability report Wabtec disclosed its complete Scope 3 emissions for the first time.",
             ("Wabtec disclosed for the first time its complete Scope 3 emissions", "Scope 3 emissions")),
            ("partial", "Wabtec disclosed its Scope 3 emissions and cut them by 20 percent.",
             ("Wabtec disclosed for the first time its complete Scope 3 emissions", "Scope 3 emissions")),
            ("contradicted", "Wabtec's global in-service fleet is fewer than 5,000 locomotives.",
             ("global in-service fleet of more than 23,000 locomotives", "locomotives")),
            ("unsupported", "Wabtec was fined over its emissions reporting.",
             ("Sustainability is a collective journey", "journey")),
        ],
    },
    "company__vossloh": {
        "anchors": ["bears overall responsibility for all sustainability issues", "Chief Operating Officer", "double materiality analysis"],
        "cases": [
            ("verified", "At Vossloh the Executive Board bears overall responsibility for all sustainability issues.",
             ("The Vossloh Executive Board bears overall responsibility for all sustainability issues.", "issues.")),
            ("partial", "The Executive Board bears overall responsibility for sustainability, and the Supervisory Board approves each target.",
             ("The Vossloh Executive Board bears overall responsibility for all sustainability issues.", "issues.")),
            ("contradicted", "Operational responsibility for sustainability at Vossloh lies with the Chief Financial Officer.",
             ("In operational management, sustainability is the responsibility of the Chief Operating Officer", "(COO).")),
            ("unsupported", "Vossloh has been fined over its sustainability reporting.",
             ("Vossloh manages sustainability strategically, systematically, and transparently.", "transparently.")),
        ],
    },
    "legal__knorr-bremse": {
        "anchors": ["opens in-depth investigation into Knorr-Bremse", "violated Section I of the Sherman Act"],
        "cases": [
            ("verified", "The US government alleged that Knorr-Bremse and Westinghouse Air Brake Technologies violated Section 1 of the Sherman Act.",
             ("alleging that Defendants Knorr-Bremse AG", "of the Sherman Act")),
            ("partial", "The US Department of Justice fined Knorr-Bremse and Wabtec for violating the Sherman Act.",
             ("alleging that Defendants Knorr-Bremse AG", "of the Sherman Act")),
            ("contradicted", "The European Commission cleared Knorr-Bremse's takeover of Haldex without any competition concerns.",
             ("The Commission has concerns regarding a number of markets where Knorr-Bremse and Haldex currently compete", "currently compete")),
            ("unsupported", "Knorr-Bremse was fined by the Bundeskartellamt for cartel behaviour.",
             ("Knorr-Bremse announced its public offer for Haldex on 5 September 2016", "2016")),
        ],
    },
    "legal__vossloh": {
        "anchors": ["3.4 million euros", "Vossloh Laeis GmbH", "rail cartel"],
        "cases": [
            ("verified", "In March 2016 the Bundeskartellamt imposed a fine of 3.4 million euros on Vossloh Laeis GmbH in the rail cartel case.",
             ("In March 2016 one last fine amounting to 3.4 million euros", "Vossloh Laeis GmbH, Trier.")),
            ("partial", "Vossloh Laeis GmbH was fined 3.4 million euros, the largest fine in the case.",
             ("In March 2016 one last fine amounting to 3.4 million euros", "Vossloh Laeis GmbH, Trier.")),
            ("contradicted", "The fine on Vossloh Laeis GmbH is final and binding.",
             ("This fine has been appealed and is not yet binding.", "binding.")),
            ("unsupported", "Vossloh paid damages to local transport companies.",
             ("The rail cartel proceedings were originally triggered by an application for leniency", "in 2011.")),
        ],
    },
    "legal__wabtec": {
        "anchors": ["WABTEC UK MANUFACTURING LIMITED", "10 officers / 7 resignations"],
        "cases": [
            ("verified", "The company is registered as WABTEC UK MANUFACTURING LIMITED.", ("WABTEC UK MANUFACTURING LIMITED", "LIMITED")),
            ("partial", "The company has 10 officers and 7 resignations, and none of them is American.", ("Officers: 10 officers / 7 resignations", "resignations")),
            ("contradicted", "WABTEC UK MANUFACTURING LIMITED has no officers.", ("Officers: 10 officers / 7 resignations", "resignations")),
            ("unsupported", "The company was dissolved in 2020.", ("156 Great Charles Street, Queensway, Birmingham", "B3 3HN")),
        ],
    },
    "science__knorr-bremse": {
        "anchors": ["Control of rail vehicle parameters with local controllers", "Knorr Bremse Rail Systems UK Ltd"],
        "cases": [
            ("verified", "Knorr-Bremse Systeme für Schienenfahrzeuge GmbH is named as assignee of a German patent application on control of rail vehicle parameters with local controllers.",
             ("Knorr-Bremse Systeme für Schienenfahrzeuge GmbH | Control of rail vehicle parameters with local controllers", "local controllers")),
            ("partial", "Ross Bradley and Nigel Anstey are the inventors, and the patent has expired.", ("Inventor", "Nigel Anstey")),
            ("contradicted", "The patent US9434391B2 has the legal status abandoned.", ("Active, expires", "expires")),
            ("unsupported", "Knorr-Bremse was sued for infringing this patent.",
             ("Assigned to KNORR-BREMSE RAIL SYSTEMS (UK) LIMITED", "(UK) LIMITED")),
        ],
    },
    "science__wabtec": {
        "anchors": ["79 degrees", "250-car air brake test rack", "were killed"],
        "cases": [
            ("verified", "TSB investigators tested air brakes on a 250-car test rack in Wilmerding, Pennsylvania.",
             ("TSB investigators visited", "Wilmerding, Pennsylvania.")),
            ("verified", "In the September 2022 Imperial County collision, the controlling engineer and conductor of the lead locomotive were killed.",
             ("the controlling engineer and conductor of the lead locomotive were killed", "were killed")),
            ("partial", "The tests showed the brakes could be released but not applied with the angle cock handle at 79 degrees, and Wabtec was found at fault.",
             ("it was possible to adjust the angle cock handle", "handle at 79 degrees.")),
            ("contradicted", "The angle cock valve was fully closed at 90 degrees.", ("the valve was fully closed at 80 degrees", "80 degrees")),
            ("unsupported", "The angle cock was replaced after the investigation.",
             ("Although the entire range of travel of the angle cock was 90 degrees", "90 degrees")),
        ],
    },
}


def cut(text: str, start: str, end: str) -> str | None:
    i = text.find(start)
    if i < 0:
        return None
    j = text.find(end, i + len(start) - len(end) if end in start else i)
    if j < 0:
        return None
    return " ".join(text[i:j + len(end)].split())


def main() -> int:
    gold, errors = {}, []
    for name, spec in SPEC.items():
        path = EVIDENCE / f"{name}.json"
        if not path.exists():
            errors.append(f"{name}: no evidence file")
            continue
        pages = json.loads(path.read_text(encoding="utf-8"))["pages"]
        texts = [p["text"] for p in pages]
        flat = " ".join(" ".join(t.split()) for t in texts).lower()
        for a in spec["anchors"]:
            if " ".join(a.split()).lower() not in flat:
                errors.append(f"{name}: anchor not in text: {a!r}")
        cases = []
        for label, statement, (start, end) in spec["cases"]:
            quote = next((q for t in texts if (q := cut(t, start, end))), None)
            if quote is None:
                errors.append(f"{name}: quote not found: {start!r} .. {end!r}")
                continue
            cases.append({"label": label, "statement": statement, "quote": quote})
        gold[name] = {"anchors": spec["anchors"], "cases": cases}
    if errors:
        print("\n".join(errors))
        return 1
    (ROOT / "eval" / "gold.json").write_text(json.dumps(gold, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    counts = {l: sum(c["label"] == l for g in gold.values() for c in g["cases"]) for l in ("verified", "partial", "contradicted", "unsupported")}
    print(f"gold.json: {len(gold)} sets, {sum(len(g['cases']) for g in gold.values())} cases {counts}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
