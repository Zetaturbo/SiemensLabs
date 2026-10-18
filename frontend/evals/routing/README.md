# Routing eval

`questions.json`: buyer question -> expected skill (+ key args). Target: at least 27 of 30 correct on the demo model.
Run with `pnpm eval:routing` (script to write: send each question through the chat route's tool-selection step
with temperature 0, compare the first tool call to expected_skill, print accuracy and time to first token).
Grow this with the data owner's generated test set (ARCHITECTURE.md section 9).
