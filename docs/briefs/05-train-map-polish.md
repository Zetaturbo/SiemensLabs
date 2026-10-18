# Brief 05: train map visual polish

Branch: `feat/train-map-polish` from `feat/train-map-minimal` (after brief 02 is committed), merged into `integration`
with it. Edit only `frontend/src/components/train/**`, `frontend/src/app/train/**`, `frontend/src/config/train-parts.json`
and the `--bp-*` tokens in `frontend/src/design-system` if a new token is needed. Read
`frontend/src/components/train/README.md` and the brief 02 result first. No LLM key needed.

## Direction (decided by the product owner)
The train map is the most visible part of the product and must look exceptional: a calm, precise blueprint of a
high-speed train that a jury remembers. Brief 02's behaviour stays exactly as it is (dots and labels only on
selection, fast zoom, quiet chrome, fly-to, Reset, panel actions, GLB with placeholder fallback). This brief changes how
it looks and feels, not what it does. White/graphite in light, deep graphite in dark, blueprint palette via `--bp-*`
only, no raw hex, no new UI libraries. Design decisions are yours; the bar is "would a Siemens design lead ship this".

## Build
1. Line quality. Clean, consistent edge lines: anti-aliased, stable width in screen space at every zoom, no z-fighting,
   hidden-line pass clearly fainter than visible lines, silhouette edges slightly stronger than interior edges. No
   shimmering on orbit. Sharp on retina and at 1x. Check the edge-threshold angles per part so panel seams read as
   drawn lines, not noise.
2. Depth and light. A subtle sense of volume: fills with a faint fresnel or rim so the body reads as a solid, a soft
   contact shadow or ambient occlusion under the train, a ground plane with a fine grid that fades with distance, a
   horizon fog that merges the grid into the background. Bloom only on the selected part and the hotspot dots, never on
   the whole scene; no colour fringing. Light and dark theme each tuned by hand, not a flipped palette.
3. Motion. A short intro: the camera settles from a slightly wider view into the default view within about 1.2 s with
   an ease-out, once per load; the train edges draw in or fade in during that time. Hover and selection transitions
   are eased, about 150 to 250 ms. Fly-to keeps brief 02's timing but eases in and out without overshoot. Everything
   respects `prefers-reduced-motion`.
4. Selection and dots. The selected part gets one clear, consistent highlight (edge colour from the stage colour,
   fill a touch brighter, soft glow). Dots are crisp discs with a one-pixel ring in the background colour so they
   separate from lines; flag badges tiny and legible; the leader-line label uses the design system type scale and
   never overlaps the panel.
5. Chrome and finish. Loading state is a quiet skeleton of the canvas, not a spinner; the credit line small and
   readable in both themes; the legend and compact selects aligned on the design system spacing; the panel's
   numbers in Geist Mono; no layout shift when the panel opens. The page title and the favicon match the product.
6. Performance. 60 fps on an integrated GPU at 1440x900: no per-frame allocations in the hotspot projection, static
   geometry merged where possible, post-processing only while something moves (demand frame loop with invalidate on
   interaction), DPR capped at 2. Measure with the browser's performance panel or `renderer.info` and report before and
   after draw calls and frame time.

## Verify
Headless browser screenshots of the default view, hover, selection with label and panel, light and dark, at
1440x900 and 2x DPR; a 3 s orbit recording or a sequence of frames to check for shimmer; frame time and draw calls
before and after; no console errors; the four checks pass. Save screenshots under `frontend/.screenshots/` (not
committed) and list their paths. Report the design choices you made and the ones you rejected, in under 300 words.
