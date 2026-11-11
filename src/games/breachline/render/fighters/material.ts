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
      // Dust: lower legs and boots, strongest in recesses, faded with height.
      .replace('heroRough = mix(heroRough, 0.95, cav * 0.6);', `heroRough = mix(heroRough, 0.95, cav * 0.6);
{
  float dust = (1.0 - smoothstep(0.05, 0.55, vObj.y)) * (0.35 + 0.65 * smoothstep(0.35, 0.75, big)) * (0.5 + cav);
  if (pat > 7.5 || pat > 6.5 && pat < 7.5) dust = 0.0;
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.38, 0.32), clamp(dust * 0.45, 0.0, 0.6));
  heroRough = mix(heroRough, 1.0, dust * 0.5);
}`);
  };
  return m;
}
