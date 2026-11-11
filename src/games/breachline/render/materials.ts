/** The asset renderer's one material family: MeshStandardMaterial with its lighting rewired for baked light.
 *
 * - Diffuse light comes from a lightmap (static level), per-vertex baked light (destructible panels) or an L1
 *   spherical-harmonic probe (props, things that move). Scene lights and the environment's diffuse term are ignored.
 * - A dominant-direction map lets the per-pixel normal shade the baked light, not only the reflections.
 * - Specular comes from a prefiltered environment probe, dimmed where the baked light is dim (specular occlusion).
 * - Normal maps are two-channel (BC5); z is rebuilt here. */
import * as THREE from 'three';

export interface ArtMaterialOptions {
  map: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  /** AO in R, roughness in G, metal in B. */
  armMap?: THREE.Texture | null;
  lightMap?: THREE.Texture | null;
  lightScale?: number;
  dirMap?: THREE.Texture | null;
  /** Diffuse light from vertex colours (destructible panels). */
  vertexLight?: boolean;
  /** Face tints from vertex colours (lightmapped level). */
  vertexTint?: boolean;
  /** L1 SH of incoming radiance: 4 coefficients x RGB. */
  sh?: ArrayLike<number> | null;
  envMap?: THREE.Texture | null;
  /** Average baked light of the room the environment probe saw, for specular occlusion. */
  envLight?: number;
  roughness?: number;
  /** Painted lower band by world height: tint below \`height\`, a dark 4 cm rail at the top of it. */
  band?: { height: number; tint: readonly [number, number, number] } | null;
  metalness?: number;
  color?: THREE.ColorRepresentation;
  emissive?: THREE.ColorRepresentation;
}

export function artMaterial(o: ArtMaterialOptions): THREE.MeshStandardMaterial {
  const arm = o.armMap ?? null;
  const m = new THREE.MeshStandardMaterial({
    map: o.map, normalMap: o.normalMap ?? null, roughnessMap: arm, metalnessMap: arm, aoMap: arm, aoMapIntensity: 1,
    roughness: o.roughness ?? 1, metalness: o.metalness ?? (arm ? 1 : 0), lightMap: o.lightMap ?? null, lightMapIntensity: (o.lightScale ?? 1) * Math.PI,
    envMap: o.envMap ?? null, envMapIntensity: 1, vertexColors: !!(o.vertexLight || o.vertexTint), color: o.color ?? 0xffffff,
    emissive: o.emissive ?? 0x000000,
  });
  const sh = new Float32Array(12);
  if (o.sh) sh.set(Array.from(o.sh).slice(0, 12));
  const uniforms = {
    artDirMap: { value: o.dirMap ?? null },
    artSH: { value: [0, 1, 2, 3].map(i => new THREE.Vector3(sh[i * 3], sh[i * 3 + 1], sh[i * 3 + 2])) },
    artEnvLight: { value: Math.max(0.05, o.envLight ?? 1) },
    artBand: { value: new THREE.Vector4(o.band?.tint[0] ?? 1, o.band?.tint[1] ?? 1, o.band?.tint[2] ?? 1, o.band?.height ?? -1) },
  };
  const defs = [o.dirMap && o.lightMap ? 'ART_DIRMAP' : '', o.vertexLight ? 'ART_VERTEX_LIGHT' : '', o.sh ? 'ART_SH' : '', o.band ? 'ART_BAND' : ''].filter(Boolean);
  m.userData.art = uniforms;
  m.customProgramCacheKey = () => `art:${defs.join(',')}`;
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);
    if (o.band) shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vArtY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\n\tvArtY = ( modelMatrix * vec4( transformed, 1.0 ) ).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${defs.map(d => `#define ${d}`).join('\n')}\nuniform sampler2D artDirMap;\nuniform vec3 artSH[4];\nuniform float artEnvLight;\nuniform vec4 artBand;\n#ifdef ART_BAND\nvarying float vArtY;\n#endif`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef ART_BAND
	float artRail = smoothstep( artBand.w - 0.002, artBand.w, vArtY ) - smoothstep( artBand.w + 0.038, artBand.w + 0.04, vArtY );
	diffuseColor.rgb *= mix( vArtY < artBand.w ? artBand.rgb : vec3( 1.0 ), vec3( 0.18 ), artRail );
#endif`)
      .replace('#include <normal_fragment_maps>', NORMAL_MAPS)
      .replace('#include <color_fragment>', o.vertexLight ? '' : '#include <color_fragment>')
      .replace('#include <lights_fragment_maps>', LIGHTS);
  };
  return m;
}

/** three's normal_fragment_maps with z rebuilt from the two stored channels. */
const BC5_LINE = 'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;';
const NORMAL_MAPS = THREE.ShaderChunk.normal_fragment_maps.replace(BC5_LINE,
  'vec3 mapN = vec3( texture2D( normalMap, vNormalMapUv ).xy * 2.0 - 1.0, 0.0 );\n\tmapN.z = sqrt( max( 0.0, 1.0 - dot( mapN.xy, mapN.xy ) ) );');

/** Replaces three's lights_fragment_maps for the art family. Irradiance here is pi x the baked value. */
const LIGHTS = /* glsl */`
vec3 artWorldN = inverseTransformDirection( normal, viewMatrix );
float artLight = 1.0;
#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec3 lightMapIrradiance = texture2D( lightMap, vLightMapUv ).rgb * lightMapIntensity;
		#ifdef ART_DIRMAP
			vec3 artD = texture2D( artDirMap, vLightMapUv ).rgb * 2.0 - 1.0;
			float artK = clamp( length( artD ), 0.0, 1.0 );
			artD /= max( artK, 1e-4 );
			vec3 artGeoN = inverseTransformDirection( nonPerturbedNormal, viewMatrix );
			float artF = ( dot( artWorldN, artD ) * 0.5 + 0.5 ) / max( dot( artGeoN, artD ) * 0.5 + 0.5, 0.15 );
			lightMapIrradiance *= mix( 1.0, clamp( artF, 0.0, 2.0 ), artK );
		#endif
		irradiance += lightMapIrradiance;
		artLight = dot( lightMapIrradiance, vec3( 0.3, 0.59, 0.11 ) ) / PI;
	#endif
	#ifdef ART_VERTEX_LIGHT
		irradiance += vColor.rgb * PI;
		artLight = dot( vColor.rgb, vec3( 0.3, 0.59, 0.11 ) );
	#endif
	#ifdef ART_SH
		vec3 artDC = PI * 0.282095 * artSH[ 0 ];
		vec3 artE = artDC + ( 2.0 * PI / 3.0 ) * 0.488603 * ( artSH[ 1 ] * artWorldN.y + artSH[ 2 ] * artWorldN.z + artSH[ 3 ] * artWorldN.x );
		// L1 rings negative opposite strong light; keep a share of the average so backs are dim, not black.
		artE = max( artE, artDC * 0.3 );
		irradiance += artE;
		artLight = dot( artE, vec3( 0.3, 0.59, 0.11 ) ) / PI;
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness ) * clamp( artLight / artEnvLight, 0.0, 1.6 );
#endif
`;
