# Two-minute pitch script

About 290 words, 2:00 at a relaxed pace. Screen cues in brackets. Rehearse once on the live stack.

**[0:00, train map on screen]**
We picked the procurement challenge and started digging into how a train actually gets bought. Honest reaction: this
is complicated. Hundreds of parts, dozens of buyers, thousands of suppliers, and risk data nobody has time to read. So
we asked one question: if we started at Siemens procurement tomorrow, what software would we want on day one? Then we
built it.

**[0:25, orbit the train, hover parts]**
It starts here. The whole train as a blueprint. Every part is a sourcing case, and the colour tells you where it
stands: long list, shortlist, finalists, awarded. This is multiplayer: buyers in Munich, Vienna and Krefeld see the
same train, who owns what, and what changed a minute ago. Click a part, or search for it.

**[0:45, click the brake system, Open case]**
Take the brakes, a safety-critical part. The chat is the workplace. It knows the part, the stage, your filters and
your shortlist, and it leads you through the process: what matters for brakes, which suppliers qualify, which three
to compare, who to award. Every answer ends with the next step.

**[1:10, ask "compare my top 3"]**
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
`/train` → brake system → Open case → "What matters for brakes?" → "Show suppliers without a critical quality score
and delivery above 95" → pin three → "Compare my top 3" → Suppliers tab with the brake case → back in the chat:
"Research Knorr-Bremse" (replay or live).
