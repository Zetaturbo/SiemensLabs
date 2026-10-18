# Train map

Landing screen at `/train` (`/` redirects here): a blueprint 3D train where each of the 13 parts in
`src/config/train-parts.json` is a sourcing case. State comes from the shared case store (`useCases`); UI state
(selection, hover, filters, camera requests, model bounds) lives in `store.ts`.

The canvas fills the screen below the top bar; everything else floats on it, so nothing shifts when the panel opens.

```
TrainScreen.tsx        full-bleed section: canvas, HotspotLayer, CanvasOverlay, and the PartPanel overlay on selection
CanvasOverlay.tsx      PartSearch + FilterBar top-left, MapControls bottom-left, Hint bottom centre, Legend + credit
                       bottom-right (moves left of the open panel); model tools with ?dev
PartSearch.tsx         part search: names and groups, up to 6 results, arrows + Enter select like a dot click, "/" focuses
PartPanel.tsx          the selected part: primary "Open case" (or "Start sourcing", which creates the case), Reset view
HotspotLayer.tsx       one stage-coloured dot per part (flag pip where flags exist), the hover label (name, stage) and the
                       one selection label with its leader line and an x
layout.ts              panel width and the canvas inset it covers (used for the fly-to offset and label clamping)
scene/TrainCanvas.tsx  client-only R3F canvas (next/dynamic, ssr: false): camera rig, ground, model, bloom
scene/GlbTrain.tsx     loads /models/train.glb, falls back to PlaceholderTrain on error (ModelErrorBoundary)
scene/glb-prepare.ts   turns the GLB into per-part fill + edge geometry in the train frame
scene/PlaceholderTrain procedural end car + intermediate car, same frame and positions as the GLB
scene/blueprint.tsx    fills, drei Edges / Line in two passes (visible lines, faint hidden lines)
scene/Hotspots.tsx     projects anchors each frame, places the dots, the hover label and the selection label
scene/CameraRig.tsx    camera-controls: orbit, fly-to (offset so the part sits left of the panel), Reset, zoom steps
scene/frame.ts         fits the overview to the model bounds with room for the chrome, at any canvas size
palette.ts             reads the --bp-* CSS variables so canvas and chrome share one palette
```

## Interaction

No text in the scene by default: dots only, each with a soft ring until the first selection of the session.
A one-line hint at the bottom centre fades after the first interaction or 6 s. Hover grows the dot and brightens
the part's edges; the canvas cursor is grab, grabbing while dragging, pointer over a part. Click selects (dot
click also flies to the part; double-click a mesh to fly): one label with a leader line, and the part panel opens.
Every way out of a selection eases the camera back to the overview: the x on the label, the x on the panel,
a click on empty space, Esc and Reset. View controls bottom-left: zoom in, zoom out (one wheel notch), reset.
Keys: Esc deselects, R resets, + and - zoom. Model tools (placeholder toggle, inspector, mesh log) appear in
development with `?dev` in the URL.

## Navigation

| Input | Does |
| --- | --- |
| drag (one finger, left mouse) | orbit |
| two-finger trackpad scroll | pan (truck) with the fingers, damped; the target is clamped to the model bounds plus 4 m |
| pinch (trackpad `ctrlKey` wheel, touch pinch) | dolly to the cursor, 3x speed, distance 2.5 to 80 |
| mouse wheel | dolly to the cursor, as before |
| right drag, middle drag, Shift + drag | pan |
| + / - keys, zoom buttons | one wheel notch in or out |
| R, Reset, Esc, any deselect | ease back to the overview: angles, distance and pan offset |

Browsers report a trackpad scroll and a mouse wheel as the same `wheel` event, so `CameraRig.isMouseWheel` guesses:
line-mode deltas are a mouse wheel; a sideways component, a fractional delta or a delta under 50 px is a trackpad;
a large whole-number vertical delta (one notch, typically 100 or 120 px) is a mouse wheel unless it arrives within
220 ms of a trackpad event (a fast two-finger flick). Pinches arrive with `ctrlKey` and are re-dispatched as plain
wheel events so camera-controls dollies instead of changing the field of view.

## Coordinates

Everything uses one frame: metres, rail top at y=0, car centred on x/z, nose at +x, +z towards the default camera.
The GLB is fitted into it by `model.transform` (rotation, then scale, then auto-centre). The AVEENG model needs
`rotationDeg [0, 90, 0]` and `scale 0.001` (millimetres; its Sketchfab root node already turns Z-up into Y-up).

## Swapping or re-mapping the model

1. Put the file at `public/models/train.glb` (keep it under 5 MB; see `public/models/CREDITS.md`). Without it the
   page renders the placeholder; the page checks for the file on the server, so reload in dev or rebuild in prod.
2. List objects and their bounds in the train frame:
   `pnpm tsx src/components/train/dev/glb-names.ts public/models/train.glb`
   In the browser (dev only, open `/train?dev`) the toolbar has Inspect (click the model to read object name and exact point, with copy)
   and Log meshes (`console.table` of what was loaded). By hand: `useGLTF(url).scene.traverse((o) => o.isMesh && console.log(o.name))`.
3. In `train-parts.json` per part: `meshNames` (objects whose triangles belong to the part), `glb.carve` (boxes that
   claim triangles of shared meshes, e.g. the pantograph out of the roof mesh), `glb.outline` (boxes drawn where the
   model has no geometry, e.g. underfloor equipment), `position` (hotspot anchor), `description` (shown in the part panel).
4. If the nose points the wrong way, change `rotationDeg[1]` by 180.
