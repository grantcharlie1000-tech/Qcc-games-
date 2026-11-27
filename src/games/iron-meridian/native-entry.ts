import type { GameModule } from '../../core/types';
import { createNativeMapView } from './native-map-view';
import type { NativeMapView } from './native-map-view';
import { captureNativeBaseDirectory } from './native/local-source';
import { NativeLoaderError } from './native/loader-protocol';
import type { NativeBaseManifest, NativeLoaderRequest, NativeLoaderResponse } from './native/loader-protocol';
import { readNativeViewSave } from './native-view-state';
import type { NativeViewSave } from './native-view-state';
import './native-style.css';

const game: GameModule = {
  id: 'iron-meridian', title: 'Iron Meridian', cover: 'game-art/iron-meridian/cover.svg',
  rules: 'Native port in progress. Select your Hearts of Iron IV installation folder to load its loose base files locally. DLC and mods are not selected. Campaign execution is unavailable. Drag to pan, scroll or use + and - to zoom, and select a province. Keyboard: arrows pan, F fits the map, Enter selects the center.',
  mount(container, context) {
    const root = document.createElement('section');
    root.className = 'im-native';
    root.dataset.state = 'empty';
    root.innerHTML = `
      <canvas class="im-native-map" tabindex="0" aria-label="Base province map. Arrow keys pan, plus and minus zoom, F fits, Enter selects the center."></canvas>
      <header class="im-native-header im-native-glass"><div><h1>Iron Meridian</h1><span>Native port in progress</span></div><button type="button" data-action="choose">Base files</button></header>
      <section class="im-native-import im-native-glass" aria-label="Load base files">
        <h2>Load base files</h2><p class="im-native-message" role="status">Select your Hearts of Iron IV folder.</p>
        <p class="im-native-scope">Campaign port in progress.</p>
        <div class="im-native-import-actions"><button type="button" data-action="load">Choose folder</button><button type="button" data-action="cancel" hidden>Cancel</button></div>
      </section>
      <section class="im-native-selection im-native-glass" aria-label="Selected province" hidden><h2></h2><p data-field="state"></p><p data-field="terrain"></p></section>
      <nav class="im-native-map-controls im-native-glass" aria-label="Map controls" hidden><button type="button" data-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-action="fit">Fit</button></nav>
      <input class="im-native-file-input" type="file" webkitdirectory multiple tabindex="-1" aria-label="Installation folder" hidden>
    `;
    container.append(root);
    const canvas = root.querySelector<HTMLCanvasElement>('canvas')!;
    const fileInput = root.querySelector<HTMLInputElement>('input')!;
    const panel = root.querySelector<HTMLElement>('.im-native-import')!;
    const message = root.querySelector<HTMLElement>('.im-native-message')!;
    const heading = panel.querySelector('h2')!;
    const selection = root.querySelector<HTMLElement>('.im-native-selection')!;
    const controls = root.querySelector<HTMLElement>('.im-native-map-controls')!;
    const cancelButton = root.querySelector<HTMLButtonElement>('[data-action=cancel]')!;
    const loadButton = root.querySelector<HTMLButtonElement>('[data-action=load]')!;
    const listeners = new AbortController();
    let worker: Worker | undefined, renderer: NativeMapView | undefined;
    let operation: AbortController | undefined, manifest: NativeBaseManifest | undefined;
    let sequence = 0, disposed = false, paused = false, saveTimer: ReturnType<typeof setTimeout> | undefined;
    let restored: NativeViewSave | undefined;
    let legacy: unknown, hasLegacy = false;

    function serialize(): unknown {
      if (manifest && renderer) return {
        kind: 'iron-meridian-native-view', version: 1, snapshotId: manifest.snapshotId,
        camera: renderer.serialize(), ...(hasLegacy ? { legacyPrototypeSave: legacy } : {}),
      } satisfies NativeViewSave;
      if (restored) return restored;
      return hasLegacy ? legacy : undefined;
    }
    function saveSoon() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { if (!disposed && renderer) context.save(serialize()); }, 300);
    }
    function release() {
      if (manifest && renderer) restored = serialize() as NativeViewSave;
      sequence++; clearTimeout(saveTimer);
      operation?.abort(); operation = undefined;
      worker?.terminate(); worker = undefined;
      renderer?.dispose(); renderer = undefined;
      manifest = undefined;
      delete root.dataset.snapshotId;
      const drawing = canvas.getContext('2d');
      drawing?.setTransform(1, 0, 0, 1, 0, 0);
      if (drawing) { drawing.fillStyle = '#122638'; drawing.fillRect(0, 0, canvas.width, canvas.height); }
      selection.hidden = controls.hidden = true;
    }
    function empty() {
      root.dataset.state = 'empty'; panel.hidden = false;
      heading.textContent = 'Load base files';
      message.textContent = 'Select your Hearts of Iron IV folder.';
      loadButton.hidden = false; cancelButton.hidden = true;
      context.setLevel('Base files'); context.setStatus('Native port in progress');
    }
    function fail(error: unknown) {
      release(); root.dataset.state = 'error'; panel.hidden = false;
      heading.textContent = 'Files unavailable';
      message.textContent = error instanceof NativeLoaderError
        ? `${error.detail.message}${error.detail.path ? ` (${error.detail.path})` : ''}`
        : error instanceof Error ? error.message : 'Could not load base files.';
      cancelButton.hidden = true; loadButton.hidden = false;
      context.setStatus('Base files unavailable'); context.announce(message.textContent);
    }
    async function ready(data: Extract<NativeLoaderResponse, { type: 'ready' }>, ticket: number) {
      if (ticket !== sequence || disposed || !operation) return;
      message.textContent = 'Preparing map…';
      try {
        const view = await createNativeMapView(canvas, data.world, item => {
          selection.hidden = false;
          selection.querySelector('h2')!.textContent = `Province ${item.province.id}`;
          selection.querySelector('[data-field=state]')!.textContent = item.state ? `State ${item.state.id} · ${item.state.name}` : 'No base state';
          selection.querySelector('[data-field=terrain]')!.textContent = `${item.province.type} · ${item.province.terrain}`;
          selection.dataset.provinceId = String(item.province.id);
          context.announce(`Province ${item.province.id}. ${item.state ? `State ${item.state.id}.` : ''} ${item.province.terrain}.`);
        }, saveSoon, operation.signal);
        if (ticket !== sequence || disposed) { view.dispose(); return; }
        renderer = view; manifest = data.manifest;
        if (restored?.snapshotId === manifest.snapshotId) view.restore(restored.camera);
        if (paused) view.pause();
        panel.hidden = true; controls.hidden = false; cancelButton.hidden = true;
        root.dataset.state = 'ready'; root.dataset.snapshotId = manifest.snapshotId;
        context.setLevel('Base map'); context.setStatus('Campaign port in progress');
        context.announce(`Base map loaded. ${data.world.definitions.length} provinces.`);
        saveSoon();
      } catch (error) { if (ticket === sequence && !disposed) fail(error); }
    }
    function load(files: FileList) {
      let source;
      try { source = captureNativeBaseDirectory(files); }
      catch (error) {
        fileInput.value = '';
        // Invalid replacement selection leaves an already loaded map available.
        if (renderer) { context.announce(error instanceof Error ? error.message : 'Invalid folder.'); return; }
        fail(error); return;
      }
      fileInput.value = '';
      release(); operation = new AbortController();
      const ticket = sequence;
      root.dataset.state = 'loading'; panel.hidden = false;
      heading.textContent = 'Loading base files'; message.textContent = 'Reading selected files…';
      cancelButton.hidden = false; loadButton.hidden = true;
      try {
        const currentWorker = new Worker(new URL('./native/loader.worker.ts', import.meta.url), { type: 'module' });
        worker = currentWorker;
        currentWorker.addEventListener('message', ({ data }: MessageEvent<NativeLoaderResponse>) => {
          if (ticket !== sequence || data.sessionId !== ticket || disposed) return;
          if (data.type === 'progress') message.textContent = data.phase === 'lua' ? 'Loading configuration…'
            : data.phase === 'world' ? 'Loading world…'
            : `Reading base files${data.total ? ` · ${data.done} / ${data.total}` : '…'}`;
          else if (data.type === 'failed') fail(new NativeLoaderError(data.error));
          else if (data.type === 'ready') void ready(data, ticket);
        });
        currentWorker.addEventListener('error', event => {
          if (ticket !== sequence || disposed) return;
          event.preventDefault(); fail(new Error('The content worker stopped. Choose the folder to retry.'));
        });
        currentWorker.addEventListener('messageerror', () => { if (ticket === sequence && !disposed) fail(new Error('Could not read the content worker response.')); });
        const request: NativeLoaderRequest = { type: 'load', sessionId: ticket, source };
        currentWorker.postMessage(request);
      } catch (error) { fail(error); }
    }
    function choose() {
      if (paused || disposed) return;
      if (!('webkitdirectory' in fileInput)) { fail(new Error('Folder selection is unavailable in this browser.')); return; }
      fileInput.value = ''; fileInput.click();
    }
    root.addEventListener('click', event => {
      if (paused) return;
      const action = (event.target as Element).closest<HTMLButtonElement>('button[data-action]')?.dataset.action;
      if (action === 'choose' || action === 'load') choose();
      else if (action === 'cancel') { release(); empty(); }
      else if (action === 'zoom-in') renderer?.zoom(2);
      else if (action === 'zoom-out') renderer?.zoom(.5);
      else if (action === 'fit') renderer?.fit();
    }, { signal: listeners.signal });
    fileInput.addEventListener('change', () => { if (!disposed && fileInput.files?.length) load(fileInput.files); }, { signal: listeners.signal });
    empty();
    return {
      pause() { paused = true; root.inert = true; renderer?.pause(); },
      resume() { paused = false; root.inert = false; renderer?.resume(); },
      restart() { if (renderer) renderer.fit(); return false; },
      serialize,
      restore(data) {
        const save = readNativeViewSave(data);
        if (save) {
          restored = save;
          hasLegacy = 'legacyPrototypeSave' in save; legacy = save.legacyPrototypeSave;
          if (manifest?.snapshotId === save.snapshotId) renderer?.restore(save.camera);
        } else { legacy = data; hasLegacy = data !== undefined; }
      },
      dispose() { disposed = true; release(); listeners.abort(); root.remove(); },
    };
  },
};
export default game;
