/** The post-processing chain: the frame is drawn in linear HDR into a half-float target, then one composite pass
 * applies bloom, exposure, a filmic curve, the colour grade and a vignette, and writes sRGB to the screen.
 *
 * Bloom is a small mip pyramid: a soft-knee bright pass at half resolution, blurred down four levels and summed back
 * up. Cost per tier: Low has no bloom but keeps the grade and an FXAA edge pass (it renders at reduced resolution,
 * where unfiltered edges stair-step badly); Medium blooms from quarter resolution with three levels, plus FXAA;
 * High uses half resolution, four levels and MSAA on the HDR target. 'off' draws straight to the screen. */
import * as THREE from 'three';

export type PostTier = 'off' | 'low' | 'medium' | 'high';

// Targets are allocated at the largest size seen and drawn into a corner (the viewport), so the resolution scaler
// never reallocates them mid-match. `area` is the used fraction; every read is kept inside it.
const FULLSCREEN_VERT = /* glsl */`
uniform vec2 area;
varying vec2 vUv;
void main() { vUv = uv * area; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

const FETCH = /* glsl */`
uniform vec2 area;
vec4 fetch( sampler2D s, vec2 uv, vec2 texel ) { return texture2D( s, min( uv, area - 0.5 * texel ) ); }
`;

const BRIGHT = /* glsl */`${FETCH}
uniform sampler2D src; uniform vec2 texel; uniform float threshold; uniform float knee;
varying vec2 vUv;
void main() {
  // 4-tap box downsample, then a soft-knee threshold on luminance.
  vec3 c = 0.25 * ( fetch( src, vUv + texel * vec2( -1.0, -1.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 1.0, -1.0 ), texel ).rgb
    + fetch( src, vUv + texel * vec2( -1.0, 1.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 1.0, 1.0 ), texel ).rgb );
  float l = max( c.r, max( c.g, c.b ) );
  float soft = clamp( l - threshold + knee, 0.0, 2.0 * knee );
  soft = soft * soft / ( 4.0 * knee + 1e-4 );
  float w = max( soft, l - threshold ) / max( l, 1e-4 );
  gl_FragColor = vec4( min( c * w, vec3( 64.0 ) ), 1.0 );
}`;

const DOWN = /* glsl */`${FETCH}
uniform sampler2D src; uniform vec2 texel;
varying vec2 vUv;
void main() {
  // 13-tap filter (Jimenez 2014), the usual choice for stable bloom downsampling.
  vec3 a = fetch( src, vUv + texel * vec2( -2.0, -2.0 ), texel ).rgb, b = fetch( src, vUv + texel * vec2( 0.0, -2.0 ), texel ).rgb, c = fetch( src, vUv + texel * vec2( 2.0, -2.0 ), texel ).rgb;
  vec3 d = fetch( src, vUv + texel * vec2( -2.0, 0.0 ), texel ).rgb, e = fetch( src, vUv, texel ).rgb, f = fetch( src, vUv + texel * vec2( 2.0, 0.0 ), texel ).rgb;
  vec3 g = fetch( src, vUv + texel * vec2( -2.0, 2.0 ), texel ).rgb, h = fetch( src, vUv + texel * vec2( 0.0, 2.0 ), texel ).rgb, i = fetch( src, vUv + texel * vec2( 2.0, 2.0 ), texel ).rgb;
  vec3 j = fetch( src, vUv + texel * vec2( -1.0, -1.0 ), texel ).rgb, k = fetch( src, vUv + texel * vec2( 1.0, -1.0 ), texel ).rgb;
  vec3 l = fetch( src, vUv + texel * vec2( -1.0, 1.0 ), texel ).rgb, m = fetch( src, vUv + texel * vec2( 1.0, 1.0 ), texel ).rgb;
  vec3 o = e * 0.125 + ( a + c + g + i ) * 0.03125 + ( b + d + f + h ) * 0.0625 + ( j + k + l + m ) * 0.125;
  gl_FragColor = vec4( o, 1.0 );
}`;

const UP = /* glsl */`${FETCH}
uniform sampler2D src; uniform vec2 texel; uniform float weight;
varying vec2 vUv;
void main() {
  // 3x3 tent upsample, added onto the next larger level by additive blending.
  vec3 s = fetch( src, vUv, texel ).rgb * 4.0
    + ( fetch( src, vUv + texel * vec2( -1.0, 0.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 1.0, 0.0 ), texel ).rgb
      + fetch( src, vUv + texel * vec2( 0.0, -1.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 0.0, 1.0 ), texel ).rgb ) * 2.0
    + fetch( src, vUv + texel * vec2( -1.0, -1.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 1.0, -1.0 ), texel ).rgb
    + fetch( src, vUv + texel * vec2( -1.0, 1.0 ), texel ).rgb + fetch( src, vUv + texel * vec2( 1.0, 1.0 ), texel ).rgb;
  gl_FragColor = vec4( s / 16.0 * weight, 1.0 );
}`;

const COMPOSITE = /* glsl */`${FETCH}
uniform sampler2D scene; uniform sampler2D bloom; uniform float bloomStrength; uniform float exposure;
uniform vec3 lift; uniform vec3 gamma; uniform vec3 gain; uniform float saturation; uniform float vignette; uniform vec2 aspect;
uniform vec2 texel; uniform float fxaa; uniform float blackPoint;
varying vec2 vUv;
float lumaOf( vec3 c ) { c = c / ( 1.0 + c ); return dot( c, vec3( 0.299, 0.587, 0.114 ) ); }
/** A compact FXAA: find the local edge direction from luma and blend along it. */
vec3 antialias( vec2 uv ) {
  vec3 m = fetch( scene, uv, texel ).rgb;
  float lM = lumaOf( m ), lN = lumaOf( fetch( scene, uv + vec2( 0.0, texel.y ), texel ).rgb ), lS = lumaOf( fetch( scene, uv - vec2( 0.0, texel.y ), texel ).rgb );
  float lE = lumaOf( fetch( scene, uv + vec2( texel.x, 0.0 ), texel ).rgb ), lW = lumaOf( fetch( scene, uv - vec2( texel.x, 0.0 ), texel ).rgb );
  float lo = min( lM, min( min( lN, lS ), min( lE, lW ) ) ), hi = max( lM, max( max( lN, lS ), max( lE, lW ) ) );
  if ( hi - lo < max( 0.04, hi * 0.12 ) ) return m;
  float lNW = lumaOf( fetch( scene, uv + vec2( -texel.x, texel.y ), texel ).rgb ), lNE = lumaOf( fetch( scene, uv + texel, texel ).rgb );
  float lSW = lumaOf( fetch( scene, uv - texel, texel ).rgb ), lSE = lumaOf( fetch( scene, uv + vec2( texel.x, -texel.y ), texel ).rgb );
  vec2 dir = vec2( -( ( lNW + lNE ) - ( lSW + lSE ) ), ( lNW + lSW ) - ( lNE + lSE ) );
  float reduce = max( ( lNW + lNE + lSW + lSE ) * 0.03125, 1.0 / 128.0 );
  dir = clamp( dir / ( min( abs( dir.x ), abs( dir.y ) ) + reduce ), -8.0, 8.0 ) * texel;
  vec3 a = 0.5 * ( fetch( scene, uv + dir * ( 1.0 / 3.0 - 0.5 ), texel ).rgb + fetch( scene, uv + dir * ( 2.0 / 3.0 - 0.5 ), texel ).rgb );
  vec3 b = a * 0.5 + 0.25 * ( fetch( scene, uv - dir * 0.5, texel ).rgb + fetch( scene, uv + dir * 0.5, texel ).rgb );
  float lB = lumaOf( b );
  return ( lB < lo || lB > hi ) ? a : b;
}
// ACES fitted (Hill), the same family as the renderer's own curve, so Low and High agree in brightness.
vec3 RRTAndODTFit( vec3 v ) { vec3 a = v * ( v + 0.0245786 ) - 0.000090537; vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081; return a / b; }
vec3 aces( vec3 c ) {
  const mat3 i = mat3( 0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777 );
  const mat3 o = mat3( 1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602 );
  c = i * ( c / 0.6 ); c = RRTAndODTFit( c ); return clamp( o * c, 0.0, 1.0 );
}
vec3 toSRGB( vec3 c ) { return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) ); }
void main() {
  vec3 c = ( fxaa > 0.5 ? antialias( vUv ) : fetch( scene, vUv, texel ).rgb ) + fetch( bloom, vUv, texel ).rgb * bloomStrength;
  c = aces( c * exposure );
  // Black point: pull the toe down so recesses read as properly dark, not foggy.
  c = max( c - blackPoint, 0.0 ) / ( 1.0 - blackPoint );
  // Grade in display-linear space: lift/gamma/gain per channel, then saturation about luminance.
  c = pow( max( c * gain + lift * ( 1.0 - c ), 0.0 ), 1.0 / gamma );
  float y = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( y ), c, saturation );
  vec2 d = ( vUv / area - 0.5 ) * aspect;
  c *= 1.0 - vignette * smoothstep( 0.55, 1.25, dot( d, d ) * 2.2 );
  gl_FragColor = vec4( toSRGB( clamp( c, 0.0, 1.0 ) ), 1.0 );
}`;

/** The chosen grade: cool, slightly desaturated shadows, warm neutral highlights, gentle contrast. */
export const GRADE = {
  lift: new THREE.Vector3(0.03, 0.034, 0.042), gamma: new THREE.Vector3(0.9, 0.91, 0.93), gain: new THREE.Vector3(1.03, 1.0, 0.95),
  saturation: 0.84, vignette: 0.16, bloom: 0.16, threshold: 1.6, knee: 0.6, blackPoint: 0.012,
};

export interface Post {
  /** Binds the HDR target; draw the frame after this. Returns false when the chain is off (draw straight to the screen). */
  begin(): boolean;
  /** Bloom and composite to the screen. */
  end(exposure: number): void;
  setSize(width: number, height: number): void;
  setTier(t: PostTier): void;
  readonly tier: PostTier;
  dispose(): void;
}

export function createPost(renderer: THREE.WebGLRenderer, initial: PostTier): Post {
  // w x h is the drawing size; cw x ch the allocated size, which only grows (by a margin), so scaling never allocates.
  let tier = initial, w = 1, h = 1, cw = 0, ch = 0;
  const area = { value: new THREE.Vector2(1, 1) };
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag: string, uniforms: Record<string, THREE.IUniform>, blending: THREE.Blending = THREE.NoBlending) =>
    new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: frag, uniforms: { ...uniforms, area }, depthTest: false, depthWrite: false, blending, toneMapped: false });
  const bright = mat(BRIGHT, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: GRADE.threshold }, knee: { value: GRADE.knee } });
  const down = mat(DOWN, { src: { value: null }, texel: { value: new THREE.Vector2() } });
  const up = mat(UP, { src: { value: null }, texel: { value: new THREE.Vector2() }, weight: { value: 1 } }, THREE.AdditiveBlending);
  const comp = mat(COMPOSITE, {
    scene: { value: null }, bloom: { value: null }, bloomStrength: { value: GRADE.bloom }, exposure: { value: 1 },
    lift: { value: GRADE.lift }, gamma: { value: GRADE.gamma }, gain: { value: GRADE.gain }, saturation: { value: GRADE.saturation },
    vignette: { value: GRADE.vignette }, aspect: { value: new THREE.Vector2(1, 1) },
    texel: { value: new THREE.Vector2(1, 1) }, fxaa: { value: 0 }, blackPoint: { value: GRADE.blackPoint },
  });
  const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
  let hdr: THREE.WebGLRenderTarget | null = null, levels: THREE.WebGLRenderTarget[] = [];
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const draw = (m: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(scene, cam); };

  function build() {
    hdr?.dispose(); for (const l of levels) l.dispose();
    hdr = null; levels = [];
    if (tier === 'off') { cw = ch = 0; return; }
    hdr = new THREE.WebGLRenderTarget(cw, ch, { type: THREE.HalfFloatType, depthBuffer: true, samples: tier === 'high' ? 4 : 0 });
    const start = tier === 'high' ? 2 : 4, count = tier === 'high' ? 4 : tier === 'medium' ? 3 : 0;
    for (let i = 0; i < count; i++) {
      const d = start << i;
      levels.push(new THREE.WebGLRenderTarget(Math.max(1, Math.round(cw / d)), Math.max(1, Math.round(ch / d)), opts));
    }
  }
  /** Points every target's viewport at the part in use for the current drawing size. */
  function fit() {
    if (!hdr) return;
    area.value.set(w / cw, h / ch);
    hdr.viewport.set(0, 0, w, h); hdr.scissor.set(0, 0, w, h);
    for (const l of levels) {
      const lw = Math.max(1, Math.round(l.width * w / cw)), lh = Math.max(1, Math.round(l.height * h / ch));
      l.viewport.set(0, 0, lw, lh); l.scissor.set(0, 0, lw, lh);
    }
  }
  return {
    get tier() { return tier; },
    begin() {
      if (!hdr) return false;
      renderer.setRenderTarget(hdr);
      return true;
    },
    end(exposure) {
      if (!hdr) return;
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      // Bright pass into the first level, then blur down the pyramid, then add each level back up.
      if (levels.length) {
      bright.uniforms.src.value = hdr.texture; bright.uniforms.texel.value.set(1 / cw, 1 / ch);
      draw(bright, levels[0]);
      for (let i = 1; i < levels.length; i++) {
        down.uniforms.src.value = levels[i - 1].texture; down.uniforms.texel.value.set(1 / levels[i - 1].width, 1 / levels[i - 1].height);
        draw(down, levels[i]);
      }
      for (let i = levels.length - 1; i > 0; i--) {
        up.uniforms.src.value = levels[i].texture; up.uniforms.texel.value.set(1 / levels[i].width, 1 / levels[i].height);
        up.uniforms.weight.value = 0.8;
        draw(up, levels[i - 1]);
      }
      }
      comp.uniforms.scene.value = hdr.texture; comp.uniforms.bloom.value = levels[0]?.texture ?? black; comp.uniforms.exposure.value = exposure;
      comp.uniforms.bloomStrength.value = levels.length ? GRADE.bloom : 0;
      comp.uniforms.fxaa.value = tier === 'medium' ? 1 : 0; comp.uniforms.texel.value.set(1 / cw, 1 / ch);
      comp.uniforms.aspect.value.set(w / Math.max(w, h), h / Math.max(w, h));
      draw(comp, null);
      renderer.autoClear = auto;
    },
    setSize(width, height) {
      if (width === w && height === h) return;
      w = width; h = height;
      if (tier !== 'off' && (w > cw || h > ch)) { cw = Math.max(cw, Math.ceil(w * 1.1)); ch = Math.max(ch, Math.ceil(h * 1.1)); build(); }
      fit();
    },
    setTier(t) {
      if (t === tier) return;
      tier = t;
      if (tier !== 'off') { cw = Math.ceil(w * 1.1); ch = Math.ceil(h * 1.1); }
      build(); fit();
    },
    dispose() { hdr?.dispose(); for (const l of levels) l.dispose(); for (const m of [bright, down, up, comp]) m.dispose(); quad.geometry.dispose(); black.dispose(); },
  };
}
