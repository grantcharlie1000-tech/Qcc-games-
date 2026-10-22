// globe.gl's helpers import modules that only serve features Globle never enables.
// vite.config.ts aliases them here to keep the lazily loaded game chunk small.
//
// Three's WebGPU and TSL builds (~1.5 MB): only an optional WebGPU renderer and GPU heatmaps.
export class WebGPURenderer {
  constructor() { throw new Error('The WebGPU renderer is not bundled in Pocket Arcade.'); }
}
export class StorageInstancedBufferAttribute {}

// h3-js (~500 KB) serves only globe.gl's hexagon layers, which Globle never enables.
const unavailable = (): never => { throw new Error('Hexagon layers are not bundled in Pocket Arcade.'); };
export const latLngToCell = unavailable, cellToLatLng = unavailable, cellToBoundary = unavailable, polygonToCells = unavailable;
