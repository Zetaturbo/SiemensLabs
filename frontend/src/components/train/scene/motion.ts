/**
 * Shared frame-loop state for scene motion. `reveal` scales line and fill opacity from 0 to 1 while the
 * intro plays (CameraRig), so the drawing fades in as the camera settles; it stays 1 otherwise.
 */
export const reveal = { value: 1 };
