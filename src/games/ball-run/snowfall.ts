/** Christmas: snow falling through the canyon. Built to cost almost nothing:
 * - one draw call (THREE.Points) and one small static geometry, built once;
 * - every flake is placed in the vertex shader from a fixed random seed, the clock and the distance travelled,
 *   so the CPU writes four uniforms a frame and never touches a flake;
 * - flakes are world-fixed: they fall, sway, and stream past at the game's speed (the world moves toward the
 *   camera as the run advances), wrapped in a box that follows the camera so the box is always full;
 * - on-screen size is clamped, so a flake passing the lens never becomes a large overdraw sprite;
 * - they fade out in the distance and right at the lens, and are hidden under Reduce motion.
 * Additive-free, depth-tested, no depth writes: blocks and towers hide the flakes behind them. */
import * as THREE from 'three';

/** The box of snow around the camera (metres): across, up, along the course. */
export const SNOWFALL_BOX = new THREE.Vector3(13, 10, 42);
export const SNOWFALL_FLAKES = 1400;

const vertexShader = /* glsl */ `
uniform float uTime, uTravel, uLift, uViewport;
uniform vec3 uOrigin, uBox;
attribute vec4 seed;
varying float vFade;
#include <common>
void main() {
  // A world-fixed flake: falling about 1 m/s, swaying, and carried with the world as the run advances.
  float fall = .7 + .6 * seed.w;
  vec3 p = seed.xyz * uBox;
  p.x += .35 * sin(uTime * (.6 + seed.w) + seed.w * 40.0);
  p.y += -fall * uTime + uLift;
  p.z += uTravel;
  // Wrapped into the box around the camera, which sits near its back face (the road ahead fills the rest).
  vec3 lo = uOrigin - vec3(.5 * uBox.x, .45 * uBox.y, uBox.z - 4.0);
  p = lo + mod(p - lo, uBox);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  float depth = -mv.z;
  gl_Position = projectionMatrix * mv;
  // 7–10 cm flakes, sized by perspective and clamped to 2..11 device pixels.
  gl_PointSize = clamp((.07 + .03 * seed.w) * projectionMatrix[1][1] * uViewport * .5 / max(depth, .01), 2.0, 11.0);
  vFade = smoothstep(.6, 1.6, depth) * (1.0 - smoothstep(uBox.z * .6, uBox.z - 4.0, depth));
}`;

const fragmentShader = /* glsl */ `
varying float vFade;
void main() {
  float r = length(gl_PointCoord - .5);
  float a = smoothstep(.5, .15, r) * vFade * .9;
  if (a < .02) discard;
  gl_FragColor = vec4(.93, .96, 1.0, a);
}`;

export interface Snowfall {
  readonly points: THREE.Points;
  /** Per frame: the camera position, the run's distance (m) and the time (s). */
  update(origin: THREE.Vector3, distance: number, lift: number, time: number): void;
  /** The drawing buffer's height in device pixels, for the flakes' perspective size. */
  setViewport(height: number): void;
  dispose(): void;
}

export function createSnowfall(count = SNOWFALL_FLAKES): Snowfall {
  const seeds = new Float32Array(count * 4), positions = new Float32Array(count * 3);
  // Deterministic seeds, so every mount snows the same way.
  let h = 0x9e3779b9;
  const next = () => { h = Math.imul(h ^ h >>> 15, 0x2c1b3c6d); h = Math.imul(h ^ h >>> 12, 0x297a2d39); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  for (let i = 0; i < count * 4; i++) seeds[i] = next();
  const geometry = new THREE.BufferGeometry();
  // Three needs a position attribute to size the draw; the shader places every flake from `seed`.
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 }, uTravel: { value: 0 }, uLift: { value: 0 }, uViewport: { value: 800 },
    uOrigin: { value: new THREE.Vector3() }, uBox: { value: SNOWFALL_BOX.clone() },
  };
  const material = new THREE.ShaderMaterial({ uniforms, vertexShader, fragmentShader, transparent: true, depthWrite: false });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 2;
  points.name = 'snowfall';
  return {
    points,
    update(origin, distance, lift, time) {
      uniforms.uOrigin.value.copy(origin);
      // Wrapped well inside float precision on long runs: the box repeats every uBox metres anyway.
      uniforms.uTravel.value = distance % SNOWFALL_BOX.z;
      uniforms.uLift.value = lift % SNOWFALL_BOX.y;
      uniforms.uTime.value = time % 3600;
    },
    setViewport(height) { uniforms.uViewport.value = height; },
    dispose() { geometry.dispose(); material.dispose(); },
  };
}
