import { Color, InstancedBufferAttribute, type DepthModes } from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { EdgeSet } from "./edges";

/**
 * Blueprint line material: three's screen-space LineMaterial with
 * - analytic anti-aliasing across the line (a one-pixel feather in device pixels), independent of MSAA;
 * - widths in CSS pixels at any DPR, never thinner than one device pixel (thinner lines fade instead of
 *   breaking up, which is what makes thin lines shimmer while orbiting);
 * - silhouette weighting from the two face normals per edge: silhouettes are drawn full and a little wider,
 *   seams between faces that both face the camera at `interior` opacity.
 */
export interface BlueprintLineUniforms {
  uPixelRatio: { value: number };
  uInterior: { value: number };
  uSilhouetteWidth: { value: number };
}

export type BlueprintLineMaterial = LineMaterial & { userData: { uniforms: BlueprintLineUniforms } };

export function createLineMaterial(opts: { color: Color | string; opacity: number; linewidth: number; depthFunc: DepthModes; interior?: number }): BlueprintLineMaterial {
  const m = new LineMaterial({
    color: opts.color instanceof Color ? opts.color.getHex() : opts.color,
    linewidth: opts.linewidth,
    transparent: true,
    depthWrite: false,
    opacity: opts.opacity,
    fog: true,
  }) as BlueprintLineMaterial;
  m.depthFunc = opts.depthFunc;
  const uniforms: BlueprintLineUniforms = {
    uPixelRatio: { value: 1 },
    uInterior: { value: opts.interior ?? 0.55 },
    uSilhouetteWidth: { value: 1.35 },
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
            sil = step( fa * fb, 0.0 );
            w = mix( 1.0, uInterior, smoothstep( 0.25, 0.85, max( abs( fa ), abs( fb ) ) ) );
          } else if ( la > 0.0 ) {
            sil = 0.6; // open rim of a panel
          }
          vWeight = max( w, sil );
          float core = linewidth * uPixelRatio * mix( 1.0, uSilhouetteWidth, sil );
          // never thinner than one device pixel; the fragment shader fades the rest
          vCore = core;
          vQuad = max( core, 1.0 ) + 1.0;
        }`,
      )
      .replace("offset *= linewidth;", "offset *= vQuad;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "uniform float linewidth;",
        `uniform float linewidth;
        varying float vWeight;
        varying float vCore;
        varying float vQuad;`,
      )
      .replace(
        "gl_FragColor = vec4( diffuseColor.rgb, alpha );",
        `#ifndef WORLD_UNITS
          // distance from the centre line in device pixels; one-pixel feather at the edge
          float d = abs( vUv.x ) * 0.5 * vQuad;
          float coverage = clamp( 0.5 * max( vCore, 1.0 ) + 0.5 - d, 0.0, 1.0 ) * min( vCore, 1.0 );
          alpha *= coverage;
        #endif
        alpha *= vWeight;
        gl_FragColor = vec4( diffuseColor.rgb, alpha );`,
      );
  };
  m.customProgramCacheKey = () => "blueprint-line-v1";
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

export function createLines(geometry: LineSegmentsGeometry, material: BlueprintLineMaterial): LineSegments2 {
  const l = new LineSegments2(geometry, material);
  l.raycast = () => {};
  return l;
}

/** Keeps resolution and pixel ratio in device pixels so widths stay constant in CSS pixels. */
export function setLineViewport(m: BlueprintLineMaterial, width: number, height: number, dpr: number) {
  m.resolution.set(width * dpr, height * dpr);
  m.userData.uniforms.uPixelRatio.value = dpr;
}
