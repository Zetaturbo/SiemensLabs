# 3D model credits

`train.glb` (1.1 MB, committed): "AVEENG" (Velaro-class high-speed train, Siemens Velaro E family, end car) by dannzjs on Sketchfab, CC-BY 4.0.
https://sketchfab.com/3d-models/aveeng-9cafbe3dbdeb499a8c4f86b267820228
Attribution must stay visible in the app (the help dialog in the top bar shows it) and in the repository README.
The app renders geometry only (blueprint edges); textures and materials of the model are not used.

Fallback: "Tangara Sydney Trains T set" by A Certain Duck, CC-BY 4.0.
https://sketchfab.com/3d-models/tangara-sydney-trains-t-set-07d7a69ffb544ec48442ae3448ee6f1f

If the file is missing or fails to load, the train map draws a procedural placeholder in the same coordinates.
Optimize larger downloads before committing (keep under 5 MB): `npx @gltf-transform/cli optimize train-src.glb train.glb --compress draco`.
Mapping parts to the model: see `src/components/train/README.md`.
