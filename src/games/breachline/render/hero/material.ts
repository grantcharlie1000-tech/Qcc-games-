/** The hero material: three's standard PBR with one shader patch that reads per-vertex surface parameters (`pbr`:
 * roughness, metalness, wear, pattern; `edge`: convex curvature; `ao`: baked occlusion) and adds procedural detail in
 * object space: edge wear to bare metal, scratches along the bore, grime and dust in recesses, polymer grain, wood
 * grain, fabric weave, leather pebbling, and a micro-bump from screen derivatives. Fine detail fades with distance
 * (metres per pixel) so it never shimmers. No image textures: nothing to download or generate. */
import * as THREE from 'three';

const NOISE = /* glsl */`
varying vec3 vObj; varying vec3 vObjN; varying vec4 vPbr; varying float vEdge; varying float vAo;
float hh(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vn(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh(i), hh(i + vec3(1, 0, 0)), f.x), mix(hh(i + vec3(0, 1, 0)), hh(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hh(i + vec3(0, 0, 1)), hh(i + vec3(1, 0, 1)), f.x), mix(hh(i + vec3(0, 1, 1)), hh(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
// Rotated domain so the lattice never lines up with the model's axes.
const mat3 RQ = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 3; i++) { s += a * vn(p); p = RQ * p * 2.03; a *= 0.5; } return s; }
`;

export interface HeroMaterialOptions { skinned?: boolean; detail?: number; envIntensity?: number }

/** One material per mesh family; `detail` 0 drops the per-pixel noise for the lowest level of detail. */
export function heroMaterial(opt: HeroMaterialOptions = {}): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 1, envMapIntensity: opt.envIntensity ?? 1 });
  const detail = opt.detail ?? 1;
  m.customProgramCacheKey = () => `hero${detail}`;
  m.onBeforeCompile = shader => {
    shader.defines = { ...(shader.defines ?? {}), HERO_DETAIL: detail };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec4 pbr; attribute float edge; attribute float ao;
varying vec3 vObj; varying vec3 vObjN; varying vec4 vPbr; varying float vEdge; varying float vAo;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vObj = position; vObjN = normal; vPbr = pbr; vEdge = edge; vAo = ao;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
float pat = vPbr.w, wearAmt = vPbr.z;
float heroRough = vPbr.x, heroMetal = vPbr.y, heroBump = 0.0;
// Metres per pixel: fine detail fades out before it can alias.
float mpp = max(length(fwidth(vObj)), 1e-5);
float fine = 1.0 - smoothstep(0.0006, 0.002, mpp), mid = 1.0 - smoothstep(0.002, 0.008, mpp);
vec3 q = RQ * vObj;
float cav = 1.0 - vAo;
#if HERO_DETAIL > 0
float big = fbm(q * 22.0), small = vn(q * 160.0), grain = vn(q * 900.0);
#else
float big = 0.5, small = 0.5, grain = 0.5;
#endif
if (pat < 0.5) {
  // Metal: stipple, scratches along the bore, edge wear to bright steel.
  float scr = vn(vec3(vObj.x * 900.0, vObj.y * 900.0, vObj.z * 30.0) + big * 3.0);
  float scratch = smoothstep(0.86, 0.95, scr) * fine * smoothstep(0.35, 0.7, big);
  float worn = smoothstep(0.35, 0.75, vEdge * wearAmt * (0.6 + big) + scratch * wearAmt * 0.7);
  vec3 bare = vec3(0.50, 0.50, 0.51);
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.94 + 0.1 * small + 0.06 * big), bare, worn * 0.85);
  heroMetal = mix(heroMetal, 1.0, worn); heroRough = mix(heroRough + (grain - 0.5) * 0.12, 0.28, worn);
  heroBump = (grain - 0.5) * 0.25 * fine - scratch * 0.4;
} else if (pat < 1.5) {
  // Polymer: moulded grain, pale scuffs on edges.
  float scuff = smoothstep(0.45, 0.85, vEdge * wearAmt * (0.5 + big));
  diffuseColor.rgb = mix(diffuseColor.rgb * (0.9 + 0.2 * small), diffuseColor.rgb * 1.7 + 0.03, scuff * 0.6);
  heroRough = clamp(heroRough + (grain - 0.5) * 0.18 - scuff * 0.15, 0.2, 1.0);
  heroBump = (grain - 0.5) * 0.6 * fine + (small - 0.5) * 0.2 * mid;
} else if (pat < 2.5) {
  // Wood: rings along the stock, pores, oiled sheen worn on edges.
  // Grain runs along the stock (z); rings are stretched along it and warped by low-frequency noise.
  float ring = sin(vObj.y * 900.0 + vObj.x * 300.0 + vn(vec3(vObj.x * 40.0, vObj.y * 40.0, vObj.z * 6.0)) * 14.0) * 0.5 + 0.5;
  float fibre = vn(vec3(vObj.x * 900.0, vObj.y * 900.0, vObj.z * 22.0));
  diffuseColor.rgb *= 0.82 + 0.16 * ring + 0.12 * (fibre - 0.5) + 0.1 * (big - 0.5);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.5, smoothstep(0.4, 0.9, vEdge * wearAmt));
  heroRough = clamp(heroRough + (fibre - 0.5) * 0.2, 0.25, 0.9);
  heroBump = (fibre - 0.5) * 0.5 * fine;
} else if (pat < 3.5) {
  // Fabric: a weave in object space and soft colour mottling.
  float w = sin(vObj.x * 2400.0 + vObj.y * 1300.0) * sin(vObj.y * 2400.0 - vObj.z * 1300.0);
  diffuseColor.rgb *= 0.82 + 0.25 * big + 0.08 * w * fine;
  heroBump = w * 0.35 * fine + (small - 0.5) * 0.3 * mid;
} else if (pat < 4.5) {
  // Leather / synthetic glove: pebbled grain, darker creases, lighter worn high points.
  float peb = vn(q * 1400.0);
  diffuseColor.rgb *= 0.85 + 0.3 * small;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.45, smoothstep(0.4, 0.9, vEdge * wearAmt * (0.6 + big)));
  heroRough = clamp(heroRough - (peb - 0.5) * 0.2, 0.4, 1.0);
  heroBump = (peb - 0.5) * 0.5 * fine;
} else if (pat < 5.5) {
  diffuseColor.rgb *= 0.92 + 0.16 * big;
  heroBump = (grain - 0.5) * 0.15 * fine;
} else if (pat < 6.5) {
  diffuseColor.rgb *= 0.9 + 0.2 * small;
  heroBump = (grain - 0.5) * 0.4 * fine;
}
// Grime and dust settle in recesses (not on lit elements).
if (pat > 7.5) cav = 0.0;
diffuseColor.rgb *= mix(1.0, 0.4, cav);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.32, 0.29, 0.24), cav * cav * 0.35 * smoothstep(0.3, 0.7, small));
heroRough = mix(heroRough, 0.95, cav * 0.6);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = clamp(heroRough, 0.04, 1.0);')
      .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = clamp(heroMetal, 0.0, 1.0);')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#if HERO_DETAIL > 0
{
  // Bump from the procedural height via screen derivatives.
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(heroBump), hy = dFdy(heroBump);
  // heroBump is in units of 40 micrometres.
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad * 0.00004);
}
#endif`)
      // The environment map gives specular reflections only: diffuse light comes from the light probe (hemisphere and
      // key lights set from HeroLighting.probe), because baked reflection probes are in the bake's physical units.
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''))
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
if (pat > 7.5) totalEmissiveRadiance += diffuseColor.rgb * 6.0;`)
      .replace('#include <aomap_fragment>', `{
  float occ = vAo;
  reflectedLight.indirectDiffuse *= occ;
  reflectedLight.indirectSpecular *= computeSpecularOcclusion(saturate(dot(geometryNormal, geometryViewDir)), occ, material.roughness);
  reflectedLight.directDiffuse *= mix(1.0, occ, 0.5);
  reflectedLight.directSpecular *= mix(1.0, occ, 0.6);
}`);
  };
  return m;
}

export interface TextureSet { map: THREE.Texture; normalMap: THREE.Texture; arm: THREE.Texture }
/** A baked texture set's material: standard PBR from the maps (albedo; tangent-space normal; occlusion, roughness and
 * metalness in R, G, B), no per-pixel noise. As with the hero material, the environment gives specular only, and
 * vertices marked emissive in the `pbr` attribute (sight reticles, tritium) glow. */
/** With `detail`, the albedo map is a shading multiplier on the vertex colours (gloves and sleeves keep their squad
 * colours from the geometry). */
export function texturedMaterial(t: TextureSet, detail = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: t.map, normalMap: t.normalMap, aoMap: t.arm, roughnessMap: t.arm, metalnessMap: t.arm, roughness: 1, metalness: 1, vertexColors: detail });
  m.customProgramCacheKey = () => (detail ? 'heroTexD' : 'heroTex');
  m.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 pbr;\nvarying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = pbr.w > 7.5 ? 1.0 : 0.0;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGlow;')
      .replace('#include <lights_fragment_maps>', THREE.ShaderChunk.lights_fragment_maps.replace('iblIrradiance += getIBLIrradiance( geometryNormal );', ''))
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 6.0 * vGlow;');
  };
  return m;
}
