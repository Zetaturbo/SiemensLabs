# Two-minute pitch script

About 290 words, 2:00 at a relaxed pace. Plain English. Screen cues in brackets. Rehearse once on the live stack.

**[0:00, train map on screen]**
We took the procurement challenge and looked at how a train is really bought. Our first reaction: this is hard.
Hundreds of parts, many buyers, thousands of suppliers, and risk data nobody has time to read. So we asked a simple
question: if we started a job in Siemens procurement tomorrow, what software would we want on day one? We built it
with open models. NVIDIA's Nemotron 3 Ultra is the brain of the chat, running on NVIDIA and Nebius. The same models
drive our research agent, with Tavily for web search.

**[0:25, orbit the train, hover parts]**
It starts here. The whole train as a blueprint. Every part is one sourcing case, and the colour shows the status: not
started, long list, shortlist, finalists, awarded. It is built for teams. Buyers in Munich, Vienna and Krefeld see the
same train, who owns what, and what changed a minute ago. Click a part, or search for it.

**[0:45, click the brake system, Start sourcing]**
Let's take the brakes. A safety-critical part. Nothing is done yet. One click, and the chat opens at the start. It
knows the part and the stage, and it walks you through the process step by step: what matters for brakes, which
filters to use, which suppliers qualify, which three to compare, who gets the contract. Every answer ends with the
next step.

**[1:10, ask "which suppliers offer rail brake pads?", then "compare the top 3"]**
And this is the part we love. The model does not only answer with text. It builds the screen it needs, live: ranked
lists, side-by-side comparisons, risk profiles, a decision memo. The UI is generated, not pre-built. And the numbers
never go through the model. They come straight from the data.

**[1:35, Suppliers tab]**
Not everyone likes to chat. No problem. The same case is also a classic board with filters and a comparison table.
Same data, same state.

**[1:45, research block]**
Behind all of this works a research agent that reads the web: finances, legal cases, sanctions, ESG, with sources.
Real companies, checked facts.

**[1:55, back to the train]**
One train. One chat for every part. Ready for Monday.

## Demo path behind the script
`/train` → brake system (not started) → Start sourcing → "What matters for brakes?" → "We need 30,000 rail brake
pads a year for a regional train. Which suppliers offer rail brake pads?" → "Which of them meet ISO/TS 22163, lead
time 90 days or less, capacity 30,000?" → pin three → "Compare the top 3" → Suppliers tab with the brake case → back
in the chat: "Research Knorr-Bremse" (replay or live).
