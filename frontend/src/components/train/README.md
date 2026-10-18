# Train map

Home screen at `/train`: a blueprint 3D train where each of the 13 parts in `src/config/train-parts.json` is a sourcing case.
State comes from the shared case store (`useCases`); UI state (selection, hover, filters, camera requests) lives in `store.ts`.

```
TrainScreen.tsx        layout: FilterBar above, canvas + HotspotLayer + CanvasOverlay, PartPanel + ActivityFeed beside
scene/TrainCanvas.tsx  client-only R3F canvas (next/dynamic, ssr: false): camera rig, ground, model, bloom
scene/GlbTrain.tsx     loads /models/train.glb, falls back to PlaceholderTrain on error (ModelErrorBoundary)
scene/glb-prepare.ts   turns the GLB into per-part fill + edge geometry in the train frame
scene/PlaceholderTrain procedural end car + intermediate car, same frame and positions as the GLB
scene/blueprint.tsx    fills, drei Edges / Line in two passes (visible lines, faint hidden lines)
scene/Hotspots.tsx     projects anchors each frame and lays out the DOM callouts (HotspotLayer)
palette.ts             reads the --bp-* CSS variables so canvas and chrome share one palette
```

## Coordinates

Everything uses one frame: metres, rail top at y=0, car centred on x/z, nose at +x, +z towards the default camera.
The GLB is fitted into it by `model.transform` (rotation, then scale, then auto-centre). The AVEENG model needs
`rotationDeg [0, 90, 0]` and `scale 0.001` (millimetres; its Sketchfab root node already turns Z-up into Y-up).

## Swapping or re-mapping the model

1. Put the file at `public/models/train.glb` (keep it under 5 MB; see `public/models/CREDITS.md`). Without it the
   page renders the placeholder; the page checks for the file on the server, so reload in dev or rebuild in prod.
2. List objects and their bounds in the train frame:
   `pnpm tsx src/components/train/dev/glb-names.ts public/models/train.glb`
   In the browser (dev only) the toolbar has Inspect (click the model to read object name and exact point, with copy)
   and Log meshes (`console.table` of what was loaded). By hand: `useGLTF(url).scene.traverse((o) => o.isMesh && console.log(o.name))`.
3. In `train-parts.json` per part: `meshNames` (objects whose triangles belong to the part), `glb.carve` (boxes that
   claim triangles of shared meshes, e.g. the pantograph out of the roof mesh), `glb.outline` (boxes drawn where the
   model has no geometry, e.g. underfloor equipment), `position` (hotspot anchor), optional `labelOffset`.
4. If the nose points the wrong way, change `rotationDeg[1]` by 180.
