// @ts-nocheck
// QCC lifecycle adapter for Tiny Strike. The original ISC notice is in LICENSE.
import * as THREE from 'three';
import {playBox} from '../../core/play-surface';
import {SHOOTER} from './meta';
import {EventBus} from './shared/events.js';
import {CONFIG} from './shared/config.js';
import Input from './core/input.js';
import GameSettings from './core/settings.js';
import TouchControls, {shouldEnableTouchControls, setGameplayGestureGuard} from './core/touch-controls.js';
import World from './world/map.js';
import {MaterialSystem} from './gfx/materials/index.js';
import {PostChain} from './gfx/post/index.js';
import {disposeWeaponTemplates} from './gfx/weapons/registry.js';
import Player from './player/player.js';
import PlayerProfile from './player/profile.js';
import Weapons from './weapons/weapons.js';
import ViewModel from './weapons/viewmodel.js';
import Combat from './combat/combat.js';
import Bots from './ai/bots.js';
import Rounds from './game/rounds.js';
import HUD from './ui/hud.js';
import AudioSys from './audio/audio.js';
import Effects from './effects/effects.js';
import {DEFAULT_MAP_ID, normalizeMapId} from './maps/catalog.js';
import {disposeObject} from './resources.js';

export function mount(container, context) {
  const root = document.createElement('div');
  root.className = 'shooter-game';root.dataset.ready = 'false';root.dataset.paused = 'false';
  root.innerHTML = '<div id="hud"></div>';container.append(root);
  const abort = new AbortController(), frames = new Set(), timers = new Set();
  const touch = shouldEnableTouchControls();
  const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:'high-performance'});
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CONFIG.PLAYER.FOV, 1, 0.05, 400);
  scene.add(camera);root.prepend(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', `${SHOOTER.title} first person play surface`);
  renderer.domElement.tabIndex = 0;
  const search = new URLSearchParams(location.search);
  let savedMap;
  try { savedMap = localStorage.getItem('tiny-strike-map'); } catch { /* private storage */ }
  const game = {
    title:SHOOTER.title, config:CONFIG, context, root, scene, camera, renderer,
    canvas:renderer.domElement, hudRoot:root.querySelector('#hud'), events:new EventBus(),
    debug:false, sessionMode:'solo', paused:false, disposed:false, fps:60,
    gfxQuality:touch ? 'low' : 'high',selectedMapId:normalizeMapId(savedMap || DEFAULT_MAP_ID),
    asset:path => `${import.meta.env.BASE_URL}game-assets/${SHOOTER.id}/${path}`,disposeObject,
    state:{phase:'menu',round:0,scores:{ct:0,t:0},timer:0,money:CONFIG.ECON.START_MONEY,
      bomb:{planted:false,site:null,pos:null,defusingBy:null,defuseProgress:0,carrierId:null},canBuy:false,buyOpen:false},
    listen(target, type, handler, options = {}) {
      if (!target) return;
      const opts = typeof options === 'boolean' ? {capture:options} : options;
      target.addEventListener(type, event => {if (!game.disposed && !game.paused) handler(event);},
        {...opts,signal:abort.signal});
    },
    nextFrame(callback) {
      const id = requestAnimationFrame(time => {frames.delete(id);if (!game.disposed) callback(time);});
      frames.add(id);return id;
    },
    delay(callback, ms) {
      const id = setTimeout(() => {timers.delete(id);if (!game.disposed) callback();}, ms);
      timers.add(id);return id;
    },
  };
  const clock = new THREE.Clock();
  let fpsFrames = 0, fpsTime = 0, resizeObserver;
  function resize() {
    const vv = window.visualViewport;
    const box = playBox(vv ? {width:vv.width,height:vv.height,offsetTop:vv.offsetTop,offsetLeft:vv.offsetLeft} : null,
      {width:innerWidth,height:innerHeight});
    const width = Math.max(1, Math.round(box.width)), height = Math.max(1, Math.round(box.height));
    // QCC owns the CSS viewport. No phone/retina resolution cap in Round 1.
    renderer.setPixelRatio(Math.max(1, window.devicePixelRatio || 1));renderer.setSize(width, height, false);
    camera.aspect = width / height;camera.updateProjectionMatrix();game.post?.setSize();
  }
  function releaseInput() {
    game.input?.cancelLockRequest();game.input?.cancelKeyCapture('pause');
    game.touchControls?._releaseGameplayInputs();game.input?._releaseAll(true);
    if (game.input) {game.input.locked = false;game.input._virtualLock = false;}
    game.events.emit('input:unlock');setGameplayGestureGuard(false, root);
    if (document.pointerLockElement === game.canvas) document.exitPointerLock?.();
  }
  game.renderFrame = () => {
    if (game.post) game.post.render(scene, camera);else renderer.render(scene, camera);
  };
  const updateOrder = ['world','rounds','touchControls','player','weapons','viewmodel','bots',
    'combat','spectator','effects','hud','audio','input','materials'];
  function frame() {
    if (game.paused || game.disposed) return;
    const dt = Math.min(clock.getDelta(), 0.05);fpsFrames++;fpsTime += dt;
    if (fpsTime >= 1) {game.fps = fpsFrames / fpsTime;fpsFrames = 0;fpsTime = 0;}
    for (const key of updateOrder) game[key]?.update?.(dt);
    if (root.dataset.phase !== game.state.phase) root.dataset.phase = game.state.phase;
    game.renderFrame();
  }
  const instance = {
    pause() {
      if (game.disposed || game.paused) return;
      game.paused = true;root.dataset.paused = 'true';renderer.setAnimationLoop(null);releaseInput();
      void game.audio?.ctx?.suspend().catch(() => {});
    },
    resume() {
      if (game.disposed || !game.paused) return;
      game.paused = false;root.dataset.paused = 'false';clock.getDelta();
      if (game.audio?.master) game.audio.master.gain.value = context.settings.sound ? 0.5 : 0;
      if (context.settings.sound) void game.audio?.ctx?.resume().catch(() => {});
      if (touch && game.state.phase !== 'menu' && game.state.phase !== 'gameEnd') game.input?.requestLock();
      resize();renderer.setAnimationLoop(frame);
    },
    restart() {
      if (game.disposed) return;
      releaseInput();game.events.emit('ui:restart');if (touch) game.input.requestLock();
    },
    serialize() {return {version:1,mapId:game.selectedMapId};},
    restore(data) {
      if (data?.version !== 1 || !data.mapId || game.state.phase !== 'menu') return;
      game.hud._selectMap(normalizeMapId(data.mapId));
    },
    dispose() {
      if (game.disposed) return;
      game.paused = true;game.disposed = true;renderer.setAnimationLoop(null);releaseInput();
      abort.abort();resizeObserver?.disconnect();
      for (const id of frames) cancelAnimationFrame(id);for (const id of timers) clearTimeout(id);
      game.hud?._mpObserver?.disconnect();if (game.audio?.ctx) void game.audio.ctx.close().catch(() => {});
      game.events._handlers.clear();game.post?.dispose();game.world?.sky?.dispose();
      const seen = disposeObject(scene);
      disposeObject(game.world?.solids, seen);disposeObject(game.world?.environment, seen);
      for (const asset of Object.values(game.bots?._charAssets || {})) disposeObject(asset?.scene, seen);
      for (const model of Object.values(game.viewmodel?._models || {})) disposeObject(model, seen);
      disposeObject(game.viewmodel?._npcArmsSource, seen);disposeWeaponTemplates(game.materials);
      game.materials?.dispose();renderer.dispose();renderer.forceContextLoss();root.remove();
      if (import.meta.env.DEV && window.__shooter === game) delete window.__shooter;
    },
  };
  try {
    resize();renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = touch ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    game.materials = new MaterialSystem({renderer,quality:game.gfxQuality,
      anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
    const post = search.get('post');
    game.post = post !== 'off' && !touch && PostChain.supported(renderer)
      ? new PostChain(game,{aa:['msaa','fxaa','none'].includes(post) ? post : 'auto',ssao:search.get('ssao') !== 'off'}) : null;
    game.settings = new GameSettings(game);game.profile = new PlayerProfile(game);game.input = new Input(game);
    game.world = new World(game);game.effects = new Effects(game);game.audio = new AudioSys(game);
    game.player = new Player(game);game.weapons = new Weapons(game);game.viewmodel = new ViewModel(game);
    game.combat = new Combat(game);game.bots = new Bots(game);game.rounds = new Rounds(game);
    game.hud = new HUD(game);game.touchControls = new TouchControls(game);
    game.listen(window,'resize',resize,{passive:true});game.listen(window.visualViewport,'resize',resize,{passive:true});
    resizeObserver = new ResizeObserver(resize);resizeObserver.observe(root);
    game.listen(window,'keydown',event => {
      if (event.defaultPrevented || event.repeat || event.key.toLowerCase() !== 'p' || event.target?.closest?.('input,textarea,select')) return;
      if (game.state.phase === 'menu' || game.state.phase === 'gameEnd') return;
      event.preventDefault();if (game.hud.buyOpen) game.hud._setBuyOpen(false);else context.setPaused?.(true);
    });
    root.dataset.ready = 'true';root.dataset.phase = game.state.phase;
    if (import.meta.env.DEV) window.__shooter = game;
    context.setStatus('Choose a battleground, then Play vs bots. P pauses; Escape opens Study.');
    clock.getDelta();renderer.setAnimationLoop(frame);return instance;
  } catch (error) {instance.dispose();throw error;}
}
