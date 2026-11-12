/** The fighters' material: the shared hero PBR material (wear, grime, weave, micro-bump), with lighting split as the
 * environment session's probes need: the reflection probe (in physical bake units) feeds specular only, scaled by
 * `HeroLighting.environmentScale`; diffuse indirect light comes from `HeroLighting.probe()` at the fighter as a
 * uniform irradiance. Adds dust settling on the boots and lower legs (more in folds), which grounds a figure. */
import * as THREE from 'three';
import { heroMaterial } from '../hero/material';

export interface FighterMaterial extends THREE.MeshStandardMaterial { userData: { probe: { value: THREE.Color } } }

export function fighterMaterial(detail = 1): FighterMaterial {
  const m = heroMaterial({ detail }) as FighterMaterial;
  const probe = { value: new THREE.Color(0.5, 0.5, 0.5) };
  m.userData.probe = probe;
  const base = m.onBeforeCompile.bind(m);
  m.customProgramCacheKey = () => `fighter${detail}`;
  m.onBeforeCompile = (shader, renderer) => {
    base(shader, renderer);
    shader.uniforms.uProbe = probe;
    const maps = THREE.ShaderChunk.lights_fragment_maps.replace(/iblIrradiance \+= getIBLIrradiance\( geometryNormal \);/, '');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uProbe;')
      .replace('#include <lights_fragment_maps>', `${maps}\niblIrradiance += uProbe;`)
      // Uniform print and seams, then dust on the lower legs and boots, strongest in recesses.
      .replace('heroRough = mix(heroRough, 0.95, cav * 0.6);', `heroRough = mix(heroRough, 0.95, cav * 0.6);
if (pat > 2.5 && pat < 3.5 && wearAmt > 0.5) {
  // Printed uniform (wear 0.5 and above flags it): three-tone blotches at about 12 cm, broken up at 4 cm.
  vec3 cq = RQ * vObj * 9.0;
  float b1 = fbm(cq), b2 = fbm(cq * 1.9 + 7.3);
  vec3 dark = diffuseColor.rgb * vec3(0.66, 0.68, 0.7), light = diffuseColor.rgb * vec3(1.2, 1.17, 1.12);
  diffuseColor.rgb = mix(diffuseColor.rgb, dark, smoothstep(0.52, 0.56, b1));
  diffuseColor.rgb = mix(diffuseColor.rgb, light, smoothstep(0.55, 0.59, b2) * (1.0 - smoothstep(0.5, 0.56, b1)));
  // Seams: side seams where the surface turns to face sideways, knee-panel and waist seams; dashed stitching.
  float side = smoothstep(0.972, 0.99, abs(normalize(vObjN).x));
  float knee = (1.0 - smoothstep(0.0, 0.004, abs(abs(vObj.y - 0.495) - 0.065))) * step(vObj.y, 0.62);
  float waist = 1.0 - smoothstep(0.0, 0.004, abs(vObj.y - 0.955));
  float seam = max(side, max(knee, waist)) * mid;
  float stitch = step(0.5, fract((vObj.y + vObj.z) * 260.0)) * fine;
  diffuseColor.rgb *= 1.0 - seam * (0.28 + 0.12 * stitch);
  heroBump += seam * (0.8 - stitch * 0.6);
}
{
  float dust = (1.0 - smoothstep(0.05, 0.55, vObj.y)) * (0.35 + 0.65 * smoothstep(0.35, 0.75, big)) * (0.5 + cav);
  if (pat > 7.5 || pat > 6.5 && pat < 7.5) dust = 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.38, 0.32), clamp(dust * 0.45, 0.0, 0.6));
  heroRough = mix(heroRough, 1.0, dust * 0.5);
}`);
  };
  return m;
}
