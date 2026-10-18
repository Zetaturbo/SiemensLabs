# Brief 02: minimal train map

Branch: `feat/train-map-minimal` from `integration`. Edit only `frontend/src/components/train/**`,
`frontend/src/app/train/**`, `frontend/src/config/train-parts.json`. Read `frontend/src/components/train/README.md`
first. The model `public/models/train.glb` is committed; no LLM key needed.

The product owner likes the train map and wants it more minimalistic. Exactly these changes:
1. Labels only on selection. Default view: train plus one small dot per part colored by stage, tiny flag badge
   where flags exist, no text in the scene. Hover: dot grows slightly, part edges brighten, no text. Click: one clean
   label with a leader line showing the part name, and the side panel opens with description, group, stage, owner,
   counts. Escape, click on empty space or Reset deselects and hides the label. Remove or restrict the always-on
   label layer to the one selected label.
2. Faster trackpad zoom: about 3x the current dolly speed (drei CameraControls `dollySpeed`, wheel settings; dolly to
   cursor if supported), keep damping and distance limits, no overshoot.
3. Quieter chrome: filter bar reduced to owner, stage, risk as compact selects; legend as one thin line of dots with
   words; activity feed collapsed into the panel, shown only when a part is selected. Credit line stays small,
   bottom right.
4. Everything else unchanged: blueprint look, fly-to, Reset, panel actions, GLB with placeholder fallback.

Verify in a browser (headless is fine): no text until a part is clicked; label appears and disappears; wheel zoom is
fast; no console errors. Report the zoom values you chose and why.
