/**
 * Part panel geometry: it floats over the canvas on the right when the canvas is at least PANEL_BREAKPOINT wide
 * (a container query on the train screen, so the app sidebar is accounted for), as a bottom sheet below that.
 */
export const PANEL_WIDTH = 360;
export const PANEL_GAP = 12;
export const PANEL_BREAKPOINT = 1024;

/** Canvas pixels covered by the open panel on the right (0 when the panel is a bottom sheet). */
export const panelInset = (canvasWidth: number) => (canvasWidth >= PANEL_BREAKPOINT ? PANEL_WIDTH + 2 * PANEL_GAP : 0);
