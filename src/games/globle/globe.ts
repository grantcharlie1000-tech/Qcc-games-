import Globe, {type GlobeInstance} from 'globe.gl';
import {MeshPhongMaterial, Vector3} from 'three';
import world from './data/world.json';
import {LandLayer} from './land';

export interface Marker { id: string; colour: string }
interface Dot { lat: number; lng: number; colour: string }

// Unguessed land is a mid grey so that even the palest (farthest) guess stands out from it.
const OCEAN = '#2d6fa8', LAND = '#a19d91', OUTLINE = '#4b535b', GUESSED_OUTLINE = '#1f2328';
const MAX_PIXELS = 1_400_000; // backing-store budget for low-power Chromebooks
const TINY_KM2 = 3000; // too small to see at globe scale: add a marker once guessed
const IDLE_MS = 1200;
const places = new Map(world.countries.map(c => [c.id, c]));

/** Altitude (globe radii) that frames a country of this area with context around it. */
const frameAltitude = (area: number) => Math.min(2.1, Math.max(0.95, 0.75 + Math.sqrt(area) / 3200));

/**
 * The interactive globe. Unguessed land is uniform and pointer picking is disabled,
 * so hovering or tapping never reveals or submits a country.
 */
export class GlobeView {
  private readonly globe: GlobeInstance;
  private readonly material = new MeshPhongMaterial({color: OCEAN, shininess: 6});
  private colours = new Map<string, string>();
  private readonly land = new LandLayer(LAND, OUTLINE);
  private readonly abort = new AbortController();
  private readonly resize: ResizeObserver;
  private flight = 0;
  private pendingFlight: string | undefined;
  private lostTimer = 0;
  private idle = 0;
  private dragging = false;
  private paused = false;
  private disposed = false;
  private running = true;
  private readonly lastCamera = new Vector3();

  constructor(private readonly host: HTMLElement, private readonly reducedMotion: () => boolean, onLost: () => void) {
    const lowDensity = (window.devicePixelRatio || 1) >= 1.5;
    this.globe = new Globe(host, {
      animateIn: false, waitForGlobeReady: false,
      rendererConfig: {antialias: !lowDensity, alpha: false, powerPreference: 'low-power', preserveDrawingBuffer: false}
    });
    this.globe
      .backgroundColor('#0d1726')
      .globeMaterial(this.material)
      .showGraticules(false)
      .showAtmosphere(true).atmosphereColor('#8fc3ff').atmosphereAltitude(0.12)
      .enablePointerInteraction(false)
      .customLayerData([{}])
      .customThreeObject(() => this.land.group)
      .pointsData([])
      .pointLat('lat').pointLng('lng').pointColor('colour')
      .pointAltitude(0.02).pointRadius(0.45).pointResolution(10)
      .pointsTransitionDuration(0)
      .pointOfView({lat: 20, lng: 10, altitude: 1.8});
    const controls = this.globe.controls();
    controls.minDistance = 100 * 1.12; // globe radius is 100; never clip into the surface
    controls.maxDistance = 100 * 4.5;
    controls.addEventListener('start', () => {this.dragging = true; this.takeControl(); this.wake();});
    controls.addEventListener('end', () => {this.dragging = false; this.wake();});
    // Damping glides on for many frames; once the camera moves less than a pixel's
    // worth per frame, let the idle timer stop rendering instead of extending it.
    controls.addEventListener('change', () => {
      const camera = this.globe.camera().position, moved = camera.distanceTo(this.lastCamera);
      this.lastCamera.copy(camera);
      if (this.dragging || moved > 0.03) this.wake();
    });
    const signal = this.abort.signal;
    for (const type of ['pointerdown', 'wheel', 'touchstart'] as const) host.addEventListener(type, () => {this.takeControl(); this.wake();}, {passive: true, signal});
    host.addEventListener('keydown', event => this.key(event), {signal});
    const canvas = this.globe.renderer().domElement;
    canvas.setAttribute('aria-hidden', 'true');
    // Mobile browsers drop contexts in background tabs and usually give them back; Three
    // restores its resources itself. Fall back to list-only play only if that never happens.
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      clearTimeout(this.lostTimer);
      this.lostTimer = window.setTimeout(onLost, 5000);
    }, {signal});
    canvas.addEventListener('webglcontextrestored', () => {clearTimeout(this.lostTimer); this.paint(); this.fit();}, {signal});
    this.resize = new ResizeObserver(() => this.fit());
    this.resize.observe(host);
    this.fit();
    this.wake();
    host.dataset.land = 'building';
    void this.land.build().then(done => {
      if (!done || this.disposed) return;
      host.dataset.land = 'ready';
      this.paint();
    });
  }

  /** Recolours guessed countries. Order matters only for the tiny-country markers. */
  show(markers: readonly Marker[]): void {
    this.colours = new Map(markers.map(m => [m.id, m.colour]));
    this.paint();
    const dots: Dot[] = markers.flatMap(m => {
      const place = places.get(m.id);
      return place && place.area < TINY_KM2 ? [{lat: place.lat, lng: place.lng, colour: m.colour}] : [];
    });
    this.globe.pointsData(dots);
    this.host.dataset.markers = String(dots.length);
    this.wake(600);
  }

  /** Turns towards a country. Any drag, wheel or pinch cancels the flight at once. */
  flyTo(id: string): void {
    const place = places.get(id);
    if (!place) return;
    this.stopFlight();
    const target = {lat: place.lat, lng: place.lng, altitude: frameAltitude(place.area)};
    // A flight interrupted by pausing (Study, hidden tab) is resumed; manual control cancels it.
    if (this.paused) {this.pendingFlight = id; return;}
    this.pendingFlight = id;
    if (this.reducedMotion()) {this.globe.pointOfView(target, 0); this.pendingFlight = undefined; this.wake(); return;}
    const from = this.globe.pointOfView();
    let dLng = target.lng - from.lng;
    while (dLng > 180) dLng -= 360;
    while (dLng < -180) dLng += 360;
    const start = performance.now(), duration = 1100;
    const ease = (t: number) => t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration), k = ease(t);
      this.globe.pointOfView({lat: from.lat + (target.lat - from.lat) * k, lng: from.lng + dLng * k, altitude: from.altitude + (target.altitude - from.altitude) * k}, 0);
      if (t >= 1) this.pendingFlight = undefined;
      this.flight = t < 1 && !this.paused ? requestAnimationFrame(step) : 0;
      this.wake();
    };
    this.flight = requestAnimationFrame(step);
  }

  pointOfView() { return this.globe.pointOfView(); }

  private paint(): void {
    this.land.paint(this.colours, GUESSED_OUTLINE);
    this.wake(400);
  }

  pause(): void {
    this.paused = true;
    this.stopFlight();
    clearTimeout(this.idle);
    this.globe.pauseAnimation(); this.running = false; this.report();
  }
  resume(): void {
    this.paused = false;
    if (this.pendingFlight) this.flyTo(this.pendingFlight);
    this.wake();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    clearTimeout(this.lostTimer);
    this.abort.abort();
    this.resize.disconnect();
    const renderer = this.globe.renderer();
    this.globe._destructor();
    this.land.dispose();
    this.material.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
    // three-render-objects publishes its scene globally for debugging.
    delete (window as unknown as {scene?: unknown}).scene;
    this.host.replaceChildren();
  }

  /** Publishes the resting view for assistive debugging and browser tests. */
  private report(): void {
    const pov = this.globe.pointOfView();
    Object.assign(this.host.dataset, {rendering: String(this.running), lat: pov.lat.toFixed(2), lng: pov.lng.toFixed(2), altitude: pov.altitude.toFixed(3)});
  }

  private stopFlight(): void { if (this.flight) cancelAnimationFrame(this.flight); this.flight = 0; }
  /** The player took control: forget any flight that a pause interrupted. */
  private takeControl(): void { this.pendingFlight = undefined; this.stopFlight(); }

  /** Renders only while something is moving; an idle globe costs no GPU time. */
  private wake(ms = IDLE_MS): void {
    if (this.paused || this.disposed || document.hidden) return;
    // resumeAnimation() ticks the controls synchronously, which re-enters wake() via 'change'.
    if (!this.running) {this.running = true; this.host.dataset.rendering = 'true'; this.globe.resumeAnimation();}
    clearTimeout(this.idle);
    this.idle = window.setTimeout(() => {
      if (this.dragging || this.flight) this.wake(ms);
      else {this.globe.pauseAnimation(); this.running = false; this.report();}
    }, ms);
  }

  private fit(): void {
    const width = this.host.clientWidth, height = this.host.clientHeight;
    if (!width || !height || this.disposed) return;
    const ratio = Math.max(0.75, Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(MAX_PIXELS / (width * height))));
    const renderer = this.globe.renderer();
    if (renderer.getPixelRatio() !== ratio) {renderer.setPixelRatio(ratio); this.globe.postProcessingComposer().setPixelRatio(ratio);}
    this.globe.width(width).height(height);
    this.wake();
  }

  private key(event: KeyboardEvent): void {
    if (event.target !== this.host || event.altKey || event.ctrlKey || event.metaKey) return;
    const pov = this.globe.pointOfView(), step = 8 * Math.max(0.4, pov.altitude);
    const moves: Record<string, Partial<typeof pov>> = {
      ArrowLeft: {lng: pov.lng - step}, ArrowRight: {lng: pov.lng + step},
      ArrowUp: {lat: Math.min(85, pov.lat + step)}, ArrowDown: {lat: Math.max(-85, pov.lat - step)},
      '+': {altitude: Math.max(0.15, pov.altitude * 0.8)}, '=': {altitude: Math.max(0.15, pov.altitude * 0.8)},
      '-': {altitude: Math.min(3.5, pov.altitude * 1.25)}, '_': {altitude: Math.min(3.5, pov.altitude * 1.25)}
    };
    const move = moves[event.key];
    if (!move) return;
    event.preventDefault();
    this.takeControl();
    this.globe.pointOfView({...pov, ...move}, this.reducedMotion() ? 0 : 200);
    this.wake(600);
  }
}
