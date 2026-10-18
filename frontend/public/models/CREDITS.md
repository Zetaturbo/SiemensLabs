# 3D model credits

Place the train model here as `train.glb` (not committed if larger than a few MB; see README for the download step).

- "AVEENG" (Velaro-class high-speed train, Siemens Velaro E family) by dannzjs on Sketchfab, CC-BY 4.0.
  https://sketchfab.com/3d-models/aveeng-9cafbe3dbdeb499a8c4f86b267820228
  Attribution must stay visible in the app footer and in the repository README.
- Fallback: "Tangara Sydney Trains T set" by A Certain Duck, CC-BY 4.0.
  https://sketchfab.com/3d-models/tangara-sydney-trains-t-set-07d7a69ffb544ec48442ae3448ee6f1f

Optimize before committing: `npx @gltf-transform/cli optimize train-src.glb train.glb --compress draco`.
