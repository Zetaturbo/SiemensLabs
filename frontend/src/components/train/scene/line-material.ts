import { Color, CustomBlending, InstancedBufferAttribute, MaxEquation, MinEquation, Vector4, type DepthModes } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { EdgeSet } from "./edges";

/**
 * Blueprint line material: three's screen-space LineMaterial with
 * - widths in CSS pixels at any DPR: `resolution` is the drawing buffer in device pixels and widths are
 *   scaled by the pixel ratio, both set by the renderer right before each draw (see `createLines`);
 * - analytic anti-aliasing across the line: a one-device-pixel feather, never thinner than one device pixel
 *   (thinner lines fade instead of breaking up, which is what makes thin lines shimmer while orbiting);
 * - butt ends: segments meet without overlapping, so a polyline of translucent segments has no darker
 *   knots at its vertices (three's round caps overlap at every joint and double the alpha there);
 * - silhouette weighting from the two face normals per edge: silhouettes are drawn full and a little wider,
 *   seams between faces that both face the camera at `interior` opacity, with a smooth transition so a
 *   contour does not pop segment by segment while orbiting.
 * The soft variant is the selection halo: round caps with a radial falloff, blended with min (light sheet)
 * or max (dark sheet) against the sheet colour, so overlapping segments never add up.
 */
export interface BlueprintLineUniforms {
  uPixelRatio: { value: number };
  /** 0: crisp line; 1: soft halo that falls off across the width (the selection glow). */
  uSoft: { value: number };
  uInterior: { value: number };
  uSilhouetteWidth: { value: number };
  /** Sheet colour the halo fades into (soft variant only). */
  uBase: { value: Color };
}

export type BlueprintLineMaterial = LineMaterial & { userData: { uniforms: BlueprintLineUniforms } };

export function createLineMaterial(opts: {
  color: Color | string;
  opacity: number;
  linewidth: number;
  depthFunc: DepthModes;
  interior?: number;
  /** Soft halo against this sheet colour; `dark` picks max blending (glow), otherwise min (tint). */
  soft?: { base: string; dark: boolean };
}): BlueprintLineMaterial {
  const m = new LineMaterial({
    color: opts.color instanceof Color ? opts.color.getHex() : opts.color,
    linewidth: opts.linewidth,
    transparent: true,
    depthWrite: false,
    opacity: opts.opacity,
    fog: true,
  }) as BlueprintLineMaterial;
  m.depthFunc = opts.depthFunc;
  if (opts.soft) {
    // min/max ignore the blend factors: each pixel keeps the strongest halo, overlaps never accumulate
    m.blending = CustomBlending;
    m.blendEquation = opts.soft.dark ? MaxEquation : MinEquation;
    m.blendEquationAlpha = MaxEquation;
  }
  const uniforms: BlueprintLineUniforms = {
    uPixelRatio: { value: 1 },
    uSoft: { value: opts.soft ? 1 : 0 },
    uInterior: { value: opts.interior ?? 0.55 },
    uSilhouetteWidth: { value: 1.3 },
    uBase: { value: new Color(opts.soft?.base ?? "#000000") },
  };
  m.userData.uniforms = uniforms;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "uniform float linewidth;",
        `uniform float linewidth;
        uniform float uPixelRatio;
        uniform float uInterior;
        uniform float uSilhouetteWidth;
        uniform float uSoft;
        attribute vec3 instanceNormalA;
        attribute vec3 instanceNormalB;
        varying float vWeight;
        varying float vCore;
        varying float vQuad;`,
      )
      .replace(
        "float aspect = resolution.x / resolution.y;",
        `float aspect = resolution.x / resolution.y;
        {
          vec4 s0 = modelViewMatrix * vec4( instanceStart, 1.0 );
          vec4 s1 = modelViewMatrix * vec4( instanceEnd, 1.0 );
          vec3 view = normalize( -0.5 * ( s0.xyz + s1.xyz ) );
          vec3 na = normalMatrix * instanceNormalA;
          vec3 nb = normalMatrix * instanceNormalB;
          float la = length( na );
          float lb = length( nb );
          float sil = 0.0;
          float w = 1.0;
          if ( la > 0.0 && lb > 0.0 ) {
            float fa = dot( na / la, view );
            float fb = dot( nb / lb, view );
            // one face towards the camera and one away; eased over a few degrees so contours do not pop
            sil = 1.0 - smoothstep( -0.02, 0.0, fa * fb );
            w = mix( 1.0, uInterior, smoothstep( 0.25, 0.85, max( abs( fa ), abs( fb ) ) ) );
          } else if ( la > 0.0 ) {
            sil = 0.6; // open rim of a panel
          }
          vWeight = max( w, sil );
          // device pixels: resolution is the drawing buffer
          float core = linewidth * uPixelRatio * mix( 1.0, uSilhouetteWidth, sil );
          vCore = core;
          // never thinner than one device pixel, plus half a pixel of feather on each side
          vQuad = max( core, 1.0 ) + 1.0;
        }`,
      )
      // butt ends for crisp lines (no overlap at joints); round caps only for the soft halo
      .replace("offset += - dir;", "offset += - dir * uSoft;")
      .replace("offset += dir;", "offset += dir * uSoft;")
      .replace("offset *= linewidth;", "offset *= vQuad;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "uniform float linewidth;",
        `uniform float linewidth;
        uniform float uSoft;
        uniform vec3 uBase;
        varying float vWeight;
        varying float vCore;
        varying float vQuad;`,
      )
      .replace(
        "gl_FragColor = vec4( diffuseColor.rgb, alpha );",
        `#ifndef WORLD_UNITS
          // distance from the centre line in device pixels; a one-pixel box filter at the edge
          float d = abs( vUv.x ) * 0.5 * vQuad;
          float coverage = clamp( 0.5 * max( vCore, 1.0 ) + 0.5 - d, 0.0, 1.0 ) * min( vCore, 1.0 );
          // halo: radial in the round caps, so the ends fade like the sides
          float capd = max( abs( vUv.y ) - 1.0, 0.0 );
          float halo = 1.0 - smoothstep( 0.0, 1.0, length( vec2( vUv.x, capd ) ) );
          alpha *= mix( coverage, halo * halo, uSoft );
        #endif
        alpha *= vWeight;
        // the halo is written as an opaque colour between the sheet and the line colour (min/max blending)
        gl_FragColor = uSoft > 0.5 ? vec4( mix( uBase, diffuseColor.rgb, clamp( alpha, 0.0, 1.0 ) ), 1.0 ) : vec4( diffuseColor.rgb, alpha );`,
      );
  };
  m.customProgramCacheKey = () => "blueprint-line-v2";
  return m;
}

/** Geometry for an edge set, with the face normals as per-instance attributes. */
export function createLineGeometry(edges: EdgeSet): LineSegmentsGeometry {
  const g = new LineSegmentsGeometry();
  g.setPositions(edges.positions);
  g.setAttribute("instanceNormalA", new InstancedBufferAttribute(edges.na, 3));
  g.setAttribute("instanceNormalB", new InstancedBufferAttribute(edges.nb, 3));
  return g;
}

const viewport = new Vector4();

export function createLines(geometry: LineSegmentsGeometry, material: BlueprintLineMaterial): LineSegments2 {
  const l = new LineSegments2(geometry, material);
  l.raycast = () => {};
  // LineSegments2 sets `resolution` to the renderer viewport in CSS pixels before every draw, which would make
  // the device-pixel widths and feather of this shader twice as wide and soft at DPR 2. The current viewport
  // is the drawing buffer in device pixels, read without allocating, so a resize or DPR change applies on the
  // next frame with no extra bookkeeping.
  l.onBeforeRender = (renderer) => {
    renderer.getCurrentViewport(viewport);
    material.resolution.set(viewport.z, viewport.w);
    material.userData.uniforms.uPixelRatio.value = renderer.getPixelRatio();
  };
  return l;
}
