import {capabilityProblem, inspectWorldZip, nativeExitProblem, nativeSaveProblem, observeRuntimeErrors, parseParentCommand, readWorldMetadata, startNativeOperation} from './launcher-helpers.js';

const parentOrigin = location.origin;
const runtimeDirectory = new URL('./runtime/', import.meta.url);
const ui = Object.fromEntries(['launcher','play','backups','progress-panel','progress-title','progress-percent','download-progress','progress-message','notice-panel','notice-title','notice-message','reload','storage-panel','storage-message','world-panel','world-list','world-message','import','world-file'].map(id => [id, document.getElementById(id)]));
let phase = 'idle';
let launcher = null;
let loading = null;
let settings = {sound:false, reducedMotion:false};
let paused = false;
let disposed = false;
let persistence = false;
let temporaryConfirmed = false;
let releaseSessionLock = null;
let activeWorldTask = null;
let prelaunchClosing = false;
let quitTask = null;
let nativeQuitRequested = false;
let rejectPreparation = null;
let engineFailure = '';
let reportedSaveFailure = null;
let lastStudyTime = -Infinity;
const quitRequests = new Set();

function messageText(error) { return String(error?.message || error || 'The game could not complete this operation.').slice(0,1800); }
function emit(event, extra = {}) {
  if (extra.message) extra.message = messageText(extra.message);
  if (window.parent !== window) window.parent.postMessage({type:'QCC_VOXELIBRE_EVENT', event, ...extra}, parentOrigin);
}

// Native SDL creates these on the browser thread. Gate every context before
// the runtime loads so its own resume calls respect QCC's mute and Study.
const audioContexts = new Set();
const NativeAudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
if (NativeAudioContext) {
  class ArcadeAudioContext extends NativeAudioContext {
    constructor(...args) {
      super(...args);
      audioContexts.add(this);
      if (!settings.sound || paused) super.suspend().catch(() => {});
    }
    resume() { return settings.sound && !paused ? super.resume() : super.suspend(); }
    close() { audioContexts.delete(this); return super.close(); }
  }
  if (globalThis.AudioContext) globalThis.AudioContext = ArcadeAudioContext;
  if (globalThis.webkitAudioContext) globalThis.webkitAudioContext = ArcadeAudioContext;
}
function updateAudio() {
  for (const context of audioContexts) {
    if (context.state === 'closed') continue;
    context[settings.sound && !paused ? 'resume' : 'suspend']().catch(() => {});
  }
}

function capabilities() {
  let webgl2 = false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    webgl2 = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch { /* Report unavailable graphics before any expensive downloads. */ }
  return {
    secure:window.isSecureContext,
    isolated:window.crossOriginIsolated === true,
    sharedMemory:typeof SharedArrayBuffer === 'function',
    offscreenCanvas:typeof OffscreenCanvas === 'function' && typeof HTMLCanvasElement.prototype.transferControlToOffscreen === 'function',
    jspi:typeof WebAssembly !== 'undefined' && typeof WebAssembly.Suspending === 'function' && typeof WebAssembly.promising === 'function',
    webgl2,
  };
}

function showProblem(message, title = 'Unable to launch') {
  message = messageText(message);
  if (ui.launcher.isConnected) {
    ui['notice-title'].textContent = title;
    ui['notice-message'].textContent = message;
    ui['notice-panel'].hidden = false;
    ui['progress-panel'].hidden = true;
  } else {
    let panel = document.querySelector('.native-error');
    if (!panel) {
      panel = document.createElement('section');
      panel.className = 'native-error';
      panel.setAttribute('role', 'alert');
      panel.append(document.createElement('h2'), document.createElement('p'));
      document.body.append(panel);
    }
    panel.querySelector('h2').textContent = title;
    panel.querySelector('p').textContent = message;
  }
  emit('error', {message});
}

function storageMessage() {
  ui['storage-panel'].hidden = false;
  ui['storage-panel'].classList.toggle('temporary', !persistence);
  ui['storage-message'].textContent = persistence
    ? 'Worlds are stored in this browser. Keep a ZIP backup: clearing site data or browser storage eviction can remove them.'
    : 'Temporary play only. This browser could not enable world storage; worlds will be lost when this game closes.';
  ui.import.disabled = !persistence;
}

function progress(name, amount) {
  const action = name.startsWith('install:') ? 'Preparing' : name.startsWith('download:') ? 'Downloading' : name.startsWith('zip:') ? 'Packing your world' : name.startsWith('unzip:') ? 'Importing your world' : 'Loading';
  const pack = name.split(':')[1];
  const description = pack === 'mineclone2' ? 'VoxeLibre blocks, creatures and sounds' : pack === 'base' ? 'game engine data' : pack === 'certs' ? 'game resources' : 'VoxeLibre';
  const percent = Number.isFinite(amount) ? Math.max(0, Math.min(1, amount)) : 0;
  ui['progress-percent'].textContent = `${Math.round(percent * 100)}%`;
  ui['download-progress'].value = percent;
  ui['progress-message'].textContent = name.startsWith('zip:') || name.startsWith('unzip:') ? `${action}…` : `${action} ${description}…`;
  if (name.startsWith('zip:') || name.startsWith('unzip:')) ui['world-message'].textContent = `${action} · ${Math.round(percent * 100)}%`;
}

function releaseLock() { releaseSessionLock?.(); releaseSessionLock = null; }
async function takeSessionLock() {
  if (!navigator.locks?.request) throw new Error('This browser cannot safely coordinate saved worlds between tabs. Try an up-to-date Chrome or Edge browser.');
  return new Promise((resolve, reject) => {
    navigator.locks.request('qcc-voxelibre-session', {ifAvailable:true}, async lock => {
      if (!lock) { resolve(false); return; }
      await new Promise(release => { releaseSessionLock = release; resolve(true); });
    }).catch(reject);
  });
}

function rejectQuitRequests(message) {
  for (const requestId of quitRequests) emit('error', {requestId, message});
  quitRequests.clear();
}
function acknowledgeExit() {
  if (quitRequests.size) {
    for (const requestId of quitRequests) emit('exited', {requestId, persistent:persistence});
    quitRequests.clear();
  } else emit('exited', {persistent:persistence});
}

function failRuntime(error) {
  if (disposed) return;
  const message = messageText(error);
  engineFailure = message;
  phase = 'failed';
  paused = true;
  updateAudio();
  rejectPreparation?.(new Error(message));
  activeWorldTask?.fail(new Error(message));
  ui.play.disabled = true;
  ui.backups.disabled = true;
  showProblem(message);
  rejectQuitRequests(message);
  // A failed pack may still have other writes in flight. Keep our session
  // lock until the document is destroyed by Back or Check again.
}

function nativeExited(status) {
  if (disposed) return;
  phase = 'exited';
  paused = true;
  updateAudio();
  const problem = nativeExitProblem(status, reportedSaveFailure || engineFailure);
  releaseLock();
  if (problem) {
    engineFailure = problem;
    showProblem(problem, 'World save could not be confirmed');
    rejectQuitRequests(problem);
    // Keep the stopped frame and its warning until a subsequent Back action.
    return;
  }
  disposed = true;
  acknowledgeExit();
}

function loadLauncherScript() {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('launcher.js', runtimeDirectory).href;
    script.onload = resolve;
    script.onerror = () => reject(new Error('The game engine could not be downloaded. Check the connection, then choose Check again.'));
    document.head.append(script);
  });
}

async function prepareRuntime() {
  if (disposed || prelaunchClosing) return null;
  if (phase === 'ready') return launcher;
  if (loading) return loading;
  const problem = capabilityProblem(capabilities());
  if (problem) { ui.play.disabled = true; ui.backups.disabled = true; showProblem(problem); return null; }
  phase = 'loading';
  ui.play.disabled = true;
  ui.backups.disabled = true;
  ui['notice-panel'].hidden = true;
  ui['progress-panel'].hidden = false;
  ui['progress-message'].textContent = 'Opening the game engine…';
  ui['download-progress'].removeAttribute('value');
  loading = (async () => {
    try {
      if (!(await takeSessionLock())) throw new Error('VoxeLibre is already open in another QCC tab. Save and close that game, then choose Check again here.');
      await loadLauncherScript();
      if (disposed) return null;
      let resolveReady;
      const nativeReady = new Promise(resolve => { resolveReady = resolve; });
      const runtimeFailure = new Promise((_, reject) => { rejectPreparation = reject; });
      // Install the abort handler before the launcher's RAF starts luanti.js.
      globalThis.Module.onAbort = reason => failRuntime(new Error(`The game engine stopped: ${messageText(reason)}`));
      launcher = new LuantiLauncher();
      launcher.setProxy('');
      launcher.onprogress = progress;
      launcher.onerror = failRuntime;
      launcher.onprint = output => { reportedSaveFailure ||= nativeSaveProblem(output); };
      launcher.onexit = nativeExited;
      launcher.oncancel = () => failRuntime(new Error('The game could not take its saved-world lock. Close other game tabs, then choose Check again.'));
      launcher.onready = resolveReady;
      if (launcher.isReady()) resolveReady();
      // onready means the native filesystem is mounted. Every pack has its
      // own completion callback; wait for all of them before exposing worlds.
      const packs = Promise.all(['base','certs','mineclone2'].map(name => launcher.addPack(name)));
      await Promise.race([Promise.all([nativeReady, packs]), runtimeFailure]);
      rejectPreparation = null;
      if (disposed || phase === 'failed') return null;
      persistence = launcher.isPersistent();
      phase = 'ready';
      ui['progress-panel'].hidden = true;
      storageMessage();
      ui.play.disabled = prelaunchClosing;
      ui.backups.disabled = prelaunchClosing;
      emit('status', {persistent:persistence, message:persistence ? 'VoxeLibre is ready. Worlds are stored in this browser.' : 'Temporary storage only. Choose Play temporarily to continue without saved worlds.'});
      return launcher;
    } catch (error) {
      failRuntime(error);
      return null;
    }
  })();
  return loading;
}

function configure() {
  const touch = matchMedia('(pointer: coarse)').matches;
  launcher.overrideConf('pause_on_lost_focus', true);
  launcher.overrideConf('menu_last_game', 'mineclone2');
  launcher.overrideConf('maintab_LAST', 'local');
  launcher.overrideConf('qcc_singleplayer', true);
  launcher.overrideConf('enable_server', false);
  launcher.overrideConf('server_announce', false);
  launcher.overrideConf('serverlist_url', '');
  launcher.overrideConf('update_information_url', '');
  launcher.overrideConf('contentdb_enable_updates_indicator', false);
  launcher.overrideConf('touch_controls', touch ? 'true' : 'auto');
  launcher.overrideConf('touch_gui', touch);
  launcher.setConf('viewing_range', 60);
  launcher.setConf('max_block_send_distance', 4);
  launcher.setConf('max_block_generate_distance', 4);
  launcher.setConf('fps_max', 60);
  launcher.overrideConf('fps_max_unfocused', 5);
  launcher.setConf('sound_volume', 0.7);
  launcher.overrideConf('sound_volume_unfocused', 0);
  launcher.setConf('server_map_save_interval', 5.3);
  launcher.setConf('cinematic', false);
  if (settings.reducedMotion) {
    launcher.overrideConf('view_bobbing_amount', 0);
    launcher.overrideConf('fall_bobbing_amount', 0);
  }
}

async function play() {
  const engine = await prepareRuntime();
  if (!engine || disposed || prelaunchClosing || phase !== 'ready' || activeWorldTask) return;
  if (!persistence && !temporaryConfirmed) {
    temporaryConfirmed = true;
    ui.play.textContent = 'Play temporarily';
    storageMessage();
    emit('status', {persistent:false, message:'Worlds will be lost when this game closes. Choose Play temporarily if you want to continue.'});
    return;
  }
  try {
    configure();
    const args = new LuantiArgs();
    args.gameid = 'mineclone2';
    args.packs = ['mineclone2'];
    phase = 'running';
    engine.launch(args);
    emit('running', {persistent:persistence, message:persistence ? 'VoxeLibre · worlds stored in this browser' : 'VoxeLibre · temporary worlds, lost when this game closes'});
  } catch (error) { failRuntime(error); }
}

function setWorldBusy(busy) {
  const ready = phase === 'ready' && !disposed && !prelaunchClosing;
  ui.play.disabled = busy || !ready;
  ui.backups.disabled = busy || !ready;
  ui.import.disabled = busy || !ready || !persistence;
  for (const button of ui['world-list'].querySelectorAll('button')) button.disabled = busy || !ready;
}

async function exportWorld(world) {
  if (phase !== 'ready' || activeWorldTask || !persistence || prelaunchClosing) return;
  setWorldBusy(true);
  ui['world-message'].textContent = 'Packing your world…';
  const task = startNativeOperation(async () => {
    const blob = await launcher.zipWorld(world.dir);
    if (disposed) return;
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `${world.name.replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0,75) || 'VoxeLibre-world'}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    ui['world-message'].textContent = `Your backup of ${world.name} is ready to save.`;
  });
  activeWorldTask = task;
  try { await task.promise; }
  catch (error) { ui['world-message'].textContent = `Backup failed: ${messageText(error)}`; }
  finally { if (activeWorldTask === task) activeWorldTask = null; setWorldBusy(false); }
}

async function listWorlds() {
  const worlds = (await launcher.listWorlds()).filter(world => world.gameid === 'mineclone2');
  ui['world-list'].replaceChildren();
  if (!worlds.length) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = persistence ? 'No saved worlds yet. Start a game and create your first world, or import a backup.' : 'World backups need persistent browser storage, which is unavailable here.';
    ui['world-list'].append(empty);
    return;
  }
  for (const world of worlds) {
    const row = document.createElement('div');
    row.className = 'world-row';
    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'world-name';
    name.textContent = world.name;
    const detail = document.createElement('p');
    detail.className = 'small';
    detail.textContent = 'VoxeLibre world';
    info.append(name, detail);
    const button = document.createElement('button');
    button.className = 'secondary';
    button.type = 'button';
    button.textContent = 'Download ZIP';
    button.setAttribute('aria-label', `Download ${world.name} as ZIP`);
    button.addEventListener('click', () => exportWorld(world));
    row.append(info, button);
    ui['world-list'].append(row);
  }
}

async function backups() {
  const engine = await prepareRuntime();
  if (!engine || disposed || prelaunchClosing || phase !== 'ready' || activeWorldTask) return;
  ui['world-panel'].hidden = false;
  try { await listWorlds(); }
  catch (error) { ui['world-message'].textContent = `Could not read saved worlds: ${messageText(error)}`; }
  ui['world-panel'].scrollIntoView({block:'nearest'});
}

async function importWorld(file) {
  if (!file || phase !== 'ready' || !persistence || activeWorldTask || prelaunchClosing) return;
  setWorldBusy(true);
  ui['world-message'].textContent = 'Checking your world backup…';
  const task = startNativeOperation(async () => {
    if (file.size > 256 * 1024 * 1024) throw new Error('Choose a world ZIP smaller than 256 MB.');
    const bytes = await file.arrayBuffer();
    const info = inspectWorldZip(bytes);
    const metadata = await readWorldMetadata(bytes, info);
    // The native installer replaces its target. A checked random directory
    // keeps an import from ever pointing at an existing world.
    let directory;
    do { directory = `qcc-import-${crypto.randomUUID()}`; } while (await launcher.worldExists(directory));
    await launcher.installZip('world', directory, info.prefix, info.count, bytes);
    await listWorlds();
    ui['world-message'].textContent = `Imported ${metadata.name} as a new world. Your existing worlds are unchanged.`;
  });
  activeWorldTask = task;
  try { await task.promise; }
  catch (error) { ui['world-message'].textContent = `Import failed: ${messageText(error)}`; }
  finally { if (activeWorldTask === task) activeWorldTask = null; ui['world-file'].value = ''; setWorldBusy(false); }
}

function pause() {
  paused = true;
  updateAudio();
  if (phase === 'running') {
    // Focus loss invokes native pause_on_lost_focus. Synthesizing Escape here
    // could toggle an already-open pause menu back into live gameplay.
    document.exitPointerLock?.();
    document.activeElement?.blur?.();
    window.dispatchEvent(new Event('blur'));
  }
}

function quit(requestId) {
  quitRequests.add(requestId);
  if (phase === 'running') {
    if (!nativeQuitRequested) {
      nativeQuitRequested = true;
      try {
        // This is the same native request used by upstream Exit Luanti,
        // without assuming its menu DOM has already been attached.
        if (typeof globalThis.emloop_request_exit !== 'function') throw new Error('The game has not made its shutdown control available.');
        globalThis.emloop_request_exit();
      } catch (error) { nativeQuitRequested = false; showProblem(error); rejectQuitRequests(messageText(error)); }
    }
    return;
  }
  if (quitTask) return;
  const failedBeforeRequest = phase === 'failed' || phase === 'exited';
  prelaunchClosing = true;
  quitTask = (async () => {
    try {
      if (!failedBeforeRequest) {
        if (loading) await loading;
        if (activeWorldTask) await activeWorldTask.promise;
        if (engineFailure) throw new Error(engineFailure);
      }
      // No native main() is running here. Preparation and any ZIP task have
      // settled; removing this prelaunch document cannot interrupt a world save.
      disposed = true;
      phase = 'exited';
      releaseLock();
      acknowledgeExit();
    } catch (error) {
      showProblem(error);
      rejectQuitRequests(messageText(error));
    } finally { prelaunchClosing = false; quitTask = null; }
  })();
}

window.addEventListener('message', event => {
  const command = parseParentCommand(event, parentOrigin, window.parent);
  if (!command || disposed) return;
  if (command.settings) {
    settings = command.settings;
    document.body.classList.toggle('reduce-motion', settings.reducedMotion);
    updateAudio();
  }
  if (command.command === 'pause') pause();
  if (command.command === 'resume') { paused = false; updateAudio(); }
  if (command.command === 'quit') quit(command.requestId);
});

window.addEventListener('keydown', event => {
  if ((event.key !== 'Escape' && event.code !== 'Escape') || event.repeat || disposed) return;
  const time = performance.now();
  if (time - lastStudyTime < 250) return;
  lastStudyTime = time;
  // Also accept upstream's synthetic Escape after a browser consumes Escape
  // while releasing pointer lock. Native handlers still receive this event.
  emit('study');
}, true);

observeRuntimeErrors(window, runtimeDirectory.href, failRuntime);
window.addEventListener('unhandledrejection', event => {
  if (disposed || !['loading','running'].includes(phase) && !activeWorldTask) return;
  event.preventDefault();
  failRuntime(event.reason);
});
window.addEventListener('pagehide', event => { if (!event.persisted) releaseLock(); });
let nativeBodyReady = false;
new MutationObserver(() => {
  const canvas = document.querySelector('#canvas');
  if (!canvas || nativeBodyReady) return;
  nativeBodyReady = true;
  document.body.dataset.native = 'true';
  document.body.classList.toggle('reduce-motion', settings.reducedMotion);
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'VoxeLibre game. Move with WASD. I opens inventory. Escape opens Study.');
  if (paused) pause();
}).observe(document.body, {childList:true, subtree:true});

ui.play.addEventListener('click', play);
ui.backups.addEventListener('click', backups);
ui.reload.addEventListener('click', () => location.reload());
ui.import.addEventListener('click', () => ui['world-file'].click());
ui['world-file'].addEventListener('change', () => importWorld(ui['world-file'].files?.[0]));
const initialProblem = capabilityProblem(capabilities());
if (initialProblem) { ui.play.disabled = true; ui.backups.disabled = true; showProblem(initialProblem); }
// The bridge is ready immediately, before the user chooses any download.
emit('ready');
