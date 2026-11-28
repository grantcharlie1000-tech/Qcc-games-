import { bindWebglLens } from '../../ui/webgl-glass';
import { notifyGlassFrame, registerGlassFrameSource } from '../../ui/glass-frame-source';
import { openSession } from '../mount-frame';
import type { FrameMeter } from '../measure';
import type { Layout } from '../types';

function webgl2(meter: FrameMeter): object {
  const gl: Record<string, unknown> = {
    VERTEX_SHADER: 0x8B31, FRAGMENT_SHADER: 0x8B30, COMPILE_STATUS: 0x8B81, LINK_STATUS: 0x8B82,
    ARRAY_BUFFER: 0x8892, STATIC_DRAW: 0x88E4, FLOAT: 0x1406, TEXTURE_2D: 0x0DE1, TEXTURE0: 0x84C0,
    TEXTURE_MIN_FILTER: 0x2801, TEXTURE_MAG_FILTER: 0x2800, LINEAR: 0x2601,
    TEXTURE_WRAP_S: 0x2802, TEXTURE_WRAP_T: 0x2803, CLAMP_TO_EDGE: 0x812F,
    RGBA: 0x1908, UNSIGNED_BYTE: 0x1401, COLOR_BUFFER_BIT: 0x4000, TRIANGLE_STRIP: 5,
    UNPACK_PREMULTIPLY_ALPHA_WEBGL: 0x9241, UNPACK_FLIP_Y_WEBGL: 0x9240, BLEND: 0x0BE2, DEPTH_TEST: 0x0B71,
    createShader: () => ({}), createProgram: () => ({}), createVertexArray: () => ({}), createBuffer: () => ({}), createTexture: () => ({}),
    shaderSource() {}, compileShader() {}, attachShader() {}, bindAttribLocation() {}, linkProgram() {},
    getShaderParameter: () => true, getProgramParameter: () => true, getShaderInfoLog: () => '', getProgramInfoLog: () => '',
    getUniformLocation: () => ({}), useProgram() {}, bindVertexArray() {}, bindBuffer() {}, bufferData() {},
    enableVertexAttribArray() {}, vertexAttribPointer() {}, bindTexture() {}, texParameteri() {}, pixelStorei() {},
    uniform1i() {}, uniform1f() {}, uniform2f() {}, uniform4f() {}, disable() {}, clearColor() {}, viewport() {}, clear() {},
    activeTexture() {}, isContextLost: () => false, getExtension: () => null, getParameter: () => 0,
    texImage2D() { meter.allocations += 1; },
    texSubImage2D() {},
    drawArrays(_mode: number, _start: number, count: number) {
      meter.draws += 1;
      meter.triangles += Math.max(0, count - 2);
      meter.fillPixels += 280 * 64;
    },
  };
  return gl;
}

/** Liquid glass over a live game canvas. The play surface stays full-bleed; the lens only refracts it. */
export const collector = {
  id: 'liquid-glass',
  group: 'shell-glass' as const,
  collect(layout: Layout) {
    const session = openSession(webgl2);
    const previous = Element.prototype.checkVisibility;
    Element.prototype.checkVisibility = () => true;
    const view = document.createElement('div');
    view.className = 'game-view';
    view.style.width = `${layout.cssWidth}px`;
    view.style.height = `${layout.cssHeight}px`;
    view.innerHTML = `<div id="game-stage"><canvas style="width:${layout.cssWidth}px;height:${layout.cssHeight}px"></canvas></div><div class="game-dock" style="width:280px;height:64px"></div>`;
    document.body.append(view);
    const canvas = view.querySelector('canvas')!;
    canvas.width = Math.max(1, layout.cssWidth);
    canvas.height = Math.max(1, layout.cssHeight);
    const release = registerGlassFrameSource(canvas, () => {});
    const dock = view.querySelector<HTMLElement>('.game-dock')!;
    const lens = bindWebglLens(dock, () => {});
    try {
      lens.setEnabled(true);
      const layer = dock.querySelector<HTMLElement>('.ui-glass-gl');
      if (layer) { layer.style.width = '280px'; layer.style.height = '64px'; }
      notifyGlassFrame(canvas);
      session.meter.reset();
      notifyGlassFrame(canvas);
      const snap = session.meter.snapshot();
      if (snap.draws + snap.fillPixels + snap.triangles <= 0) throw new Error('liquid glass drew nothing');
      return snap;
    } finally {
      lens.dispose();
      release();
      view.remove();
      Element.prototype.checkVisibility = previous;
      session.restore();
    }
  },
};
