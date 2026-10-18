import { Color, DoubleSide, ShaderMaterial, UniformsLib, UniformsUtils } from "three";

/**
 * Fill of a blueprint part: a near-transparent tint with a fresnel rim, so the body reads as a solid
 * rather than a flat wash. Faces seen edge-on take on the rim colour and a little more opacity; faces
 * towards the camera stay as faint as the sheet. Writes depth (with a polygon offset) so lines behind
 * the part fall to the hidden-line pass.
 */
export type FillMaterial = ShaderMaterial & {
  uniforms: {
    uColor: { value: Color };
    uOpacity: { value: number };
    uRim: { value: Color };
    uRimStrength: { value: number };
  };
};

const vertexShader = /* glsl */ `
  #include <common>
  #include <fog_pars_vertex>
  varying vec3 vNormalV;
  varying vec3 vViewV;
  void main() {
    vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
    vNormalV = normalize( normalMatrix * normal );
    vViewV = -mvPosition.xyz;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform vec3 uRim;
  uniform float uRimStrength;
  varying vec3 vNormalV;
  varying vec3 vViewV;
  #include <common>
  #include <fog_pars_fragment>
  void main() {
    float facing = abs( dot( normalize( vNormalV ), normalize( vViewV ) ) );
    float fresnel = pow( 1.0 - facing, 2.2 );
    vec3 color = mix( uColor, uRim, fresnel * uRimStrength );
    float alpha = uOpacity * ( 1.0 + 2.2 * fresnel * uRimStrength );
    gl_FragColor = vec4( color, clamp( alpha, 0.0, 1.0 ) );
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function createFillMaterial(opts: { color: string; opacity: number; rim: string; rimStrength: number }): FillMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      { uColor: { value: new Color(opts.color) }, uOpacity: { value: opts.opacity }, uRim: { value: new Color(opts.rim) }, uRimStrength: { value: opts.rimStrength } },
    ]),
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    side: DoubleSide,
    polygonOffset: true,
    // pushed back by two pixels of its own depth slope: a line on the surface is up to about two device
    // pixels wide either side of its centre at DPR 2, and on a concave crease the face rising towards the
    // camera would otherwise clip the line's near half into the faint hidden pass (uneven width, stipple)
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
    fog: true,
  }) as FillMaterial;
}
