# Two-minute pitch script

About 290 words, 2:00 at a relaxed pace. Screen cues in brackets. Rehearse once on the live stack.

**[0:00, train map on screen]**
We picked the procurement challenge and started digging into how a train actually gets bought. Honest reaction: this
is complicated. Hundreds of parts, dozens of buyers, thousands of suppliers, and risk data nobody has time to read. So
we asked: if we started at Siemens procurement tomorrow, what software would we want on day one? We built it on open
models: NVIDIA's Nemotron 3 Ultra runs the copilot, served through NVIDIA and Nebius, and the same models power the
research agent with Tavily for web search.

**[0:25, orbit the train, hover parts]**
It starts here. The whole train as a blueprint. Every part is a sourcing case, and the colour tells you where it
stands: not started, long list, shortlist, finalists, awarded. This is multiplayer: buyers in Munich, Vienna and Krefeld see the
same train, who owns what, and what changed a minute ago. Click a part, or search for it.

**[0:45, click the brake system, Start sourcing]**
Take the brakes, a safety-critical part, nothing done yet. One click and the chat opens at the very beginning. It
knows the part and the stage, and it leads you through the process from zero: what matters for brakes, which filters
apply, which suppliers qualify, which three to compare, who to award. Every answer ends with the next step.

**[1:10, ask "which suppliers offer rail brake pads?", then "compare the top 3"]**
And here's the part we love. The model doesn't just answer in text. It builds the interface it needs, live: ranked
lists, side-by-side comparisons, risk profiles, a decision memo. Generated UI, not canned screens, and the numbers
never pass through the model. They come straight from the data service.

**[1:35, Suppliers tab]**
Not everyone wants to chat. Fine. The same case is a classic board with filters and a comparison grid, same data,
same state.

**[1:45, research block]**
Behind it all sits a research agent that reads the web: financials, legal, sanctions, ESG, with sources. Real
companies, verified claims.

**[1:55, back to the train]**
One train. One conversation per part. Ready for Monday.

## Demo path behind the script
`/train` → brake system (not started) → Start sourcing → "What matters for brakes?" → "We need 30,000 rail brake
pads a year for a regional train. Which suppliers offer rail brake pads?" → "Which of them meet ISO/TS 22163, lead
time 90 days or less, capacity 30,000?" → pin three → "Compare the top 3" → Suppliers tab with the brake case → back
in the chat: "Research Knorr-Bremse" (replay or live).
