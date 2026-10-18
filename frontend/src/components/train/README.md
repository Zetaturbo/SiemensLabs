# Train map

Landing screen at `/train` (`/` redirects here): a blueprint 3D train where each of the 13 parts in
`src/config/train-parts.json` is a sourcing case. State comes from the shared case store (`useCases`); UI state
(selection, hover, filters, camera requests, model bounds) lives in `store.ts`.

The screen fills its container in the app shell (`h-full`); the canvas covers it and everything else floats on
it, so nothing shifts when the panel opens. Chrome switches on container queries, so the sidebar counts.

```
TrainScreen.tsx        the section: canvas, loading skeleton, HotspotLayer, CanvasOverlay, PartPanel overlay on selection
CanvasOverlay.tsx      top: PartSearch + FilterBar left, Legend right; bottom: MapControls, Hint, credit; ?dev model tools
PartSearch.tsx         part search: names and groups, up to 6 results, arrows + Enter select like a dot click, "/" focuses
PartPanel.tsx          the selected part: primary "Open case" (or "Start sourcing", which creates the case), Reset view
HotspotLayer.tsx       one stage-coloured dot per part (flag badge where flags exist), the hover label (name, stage) and
                       the one selection label with its leader line and an x; forwards wheel input to the scene
blueprint.css          the --bp-* palette per theme (light sheet, dark graphite); palette.ts reads it for the canvas
layout.ts              panel width and the canvas inset it covers (fly-to offset, label clamping)
scene/TrainCanvas.tsx  client-only R3F canvas (next/dynamic, ssr: false), demand frame loop, DPR 1 to 2
scene/blueprint.tsx    BlueprintPart: fill + visible edges + hidden edges (+ glow halo), eased towards a PartVisual
scene/line-material.ts line shader: analytic AA, CSS-pixel widths, butt ends, silhouette weighting from face normals, soft halo
scene/fill-material.ts fill shader: sheet tint with a fresnel rim
scene/edges.ts         crease edges with both face normals, merging, de-duplication and cropping of edge sets
scene/GlbTrain.tsx     loads /models/train.glb, falls back to PlaceholderTrain on error (ModelErrorBoundary)
scene/glb-prepare.ts   turns the GLB into per-part fill + edge sets in the train frame (cached per scene: preparedGlb)
scene/PlaceholderTrain procedural end car + intermediate car, same frame and positions as the GLB
scene/Ground.tsx       grid, track (one merged part), contact wire, ContactShadow
scene/Hotspots.tsx     projects anchors on every rendered frame and writes dots and labels to the DOM, allocation-free
scene/CameraRig.tsx    camera-controls: intro, orbit, trackpad pan, pinch dolly, fly-to, Reset, zoom steps
scene/frame.ts         fits the overview to the model bounds with room for the chrome, at any canvas size
scene/PartThumbnail    the part thumbnail for other screens (see below)
```

## Look

Lines are drawn by `line-material.ts`: widths in CSS pixels at any DPR, never under one device pixel (thinner lines
fade instead of breaking up, which is what shimmers while orbiting), anti-aliased across the line in the shader.
The shader works in device pixels, so `createLines` sets `resolution` from the drawing buffer before every draw
(LineSegments2 would set it in CSS pixels, which doubles widths and feather at DPR 2). Crisp lines have butt ends:
round caps overlap at every joint and draw dark knots on translucent lines. Edge sets are de-duplicated (1 mm), so
no edge is drawn twice.
Each edge carries the normals of its two faces; silhouettes (one face towards the camera, one away) are drawn full
and 1.35x wider, seams between faces that both face the camera at `PartVisual.interior`. Lines behind geometry are
a second, faint pass. Fills write depth with a polygon offset so lines on their surface pass and lines behind fall
to the hidden pass; a fresnel rim gives the body volume. The selected part gets its stage colour, a tinted fill and
a soft halo pass (no post-processing, min / max blended against the sheet so overlaps do not add up). Everything a part shows eases towards its `PartVisual` in about 200 ms.

## Performance

The canvas renders on demand: camera-controls, the intro, eased transitions and store changes call `invalidate()`;
a still view draws nothing. One fill and one edge set per part (placeholder pieces and the track are merged), three
draw calls per part plus the halo while selected; no post-processing passes. The hotspot projector reuses scratch
objects and only writes the DOM when a value changed. DPR is capped at 2.

## Interaction

An intro plays once per page load: the camera settles from a wider view into the overview in 1.2 s (ease-out)
while the drawing fades in; grabbing the view ends it. No text in the scene by default: dots only, each with a soft
ring until the first selection of the session.
A one-line hint at the bottom centre fades after the first interaction or 6 s. Hover grows the dot and brightens
the part's edges; the canvas cursor is grab, grabbing while dragging, pointer over a part. Click selects (dot
click also flies to the part; double-click a mesh to fly): one label with a leader line, and the part panel opens.
Every way out of a selection eases the camera back to the overview: the x on the label, the x on the panel,
a click on empty space, Esc and Reset. View controls bottom-left: zoom in, zoom out (one wheel notch), reset.
Keys: Esc deselects, R resets, + and - zoom, / finds a part. With prefers-reduced-motion there is no intro, no
easing and no camera transition. Model tools (placeholder toggle, inspector, mesh log) appear in
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

## Part thumbnail

`import { PartThumbnail } from "@/components/train"` renders one part in its own small canvas (default 240 x 160;
props `partId`, `size`, `interactive`). Parts with GLB triangles (car body, bogies, pantograph, HVAC, cab) use the
prepared GLB, shared with the train map through `preparedGlb`; outline-only parts use the procedural placeholder
geometry, which reads better at that size. `thumbnail.cropRadius` in `train-parts.json` crops parts that repeat
along the train to a sphere around their anchor (one bogie's brakes) and adds faint running-gear context. The part
turns once per 24 s while on screen (drag pauses it when `interactive`; off under reduced motion), with a demand
frame loop, DPR up to 2, no post-processing and a skeleton while loading. It never touches `useTrainUi`.
Dev check: `/train/dev/thumbnails`.

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
