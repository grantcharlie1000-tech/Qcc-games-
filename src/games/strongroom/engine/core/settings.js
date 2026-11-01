// Device-local gameplay preferences. These deliberately live outside the
// player profile: aim feel, display brightness and physical keyboard layout
// belong to this browser, not to a ranked identity shared between devices.

export const SETTINGS_STORAGE_KEY = 'strongroom-settings-v2';

export const SETTINGS_LIMITS = Object.freeze({
  lookSensitivity: Object.freeze({ min: 0.25, max: 3, step: 0.05, default: 1 }),
  brightnessEv: Object.freeze({ min: -0.5, max: 0.5, step: 0.05, default: 0 }),
});

export const KEY_BINDING_DEFINITIONS = Object.freeze([
  Object.freeze({id:'fire',label:'Fire',canonicalKey:'mouse0',defaultKey:'mouse0'}),
  Object.freeze({id:'ads',label:'Aim down sights',canonicalKey:'mouse2',defaultKey:'mouse2'}),
  Object.freeze({id:'moveForward',label:'Move forward',canonicalKey:'w',defaultKey:'w'}),
  Object.freeze({id:'moveBackward',label:'Move backward',canonicalKey:'s',defaultKey:'s'}),
  Object.freeze({id:'moveLeft',label:'Move left',canonicalKey:'a',defaultKey:'a'}),
  Object.freeze({id:'moveRight',label:'Move right',canonicalKey:'d',defaultKey:'d'}),
  Object.freeze({id:'walk',label:'Walk',canonicalKey:'shift',defaultKey:'shift'}),
  Object.freeze({id:'crouch',label:'Crouch',canonicalKey:'c',defaultKey:'c'}),
  Object.freeze({id:'jump',label:'Vault / jump',canonicalKey:' ',defaultKey:' '}),
  Object.freeze({id:'use',label:'Interact',canonicalKey:'f',defaultKey:'f'}),
  Object.freeze({id:'reload',label:'Reload',canonicalKey:'r',defaultKey:'r'}),
  Object.freeze({id:'leanLeft',label:'Lean left',canonicalKey:'q',defaultKey:'q'}),
  Object.freeze({id:'leanRight',label:'Lean right',canonicalKey:'e',defaultKey:'e'}),
  Object.freeze({id:'gadget',label:'Unique gadget',canonicalKey:'g',defaultKey:'g'}),
  Object.freeze({id:'weapon3',label:'General gadget',canonicalKey:'3',defaultKey:'3'}),
  Object.freeze({id:'weapon1',label:'Primary',canonicalKey:'1',defaultKey:'1'}),
  Object.freeze({id:'weapon2',label:'Secondary',canonicalKey:'2',defaultKey:'2'}),
  Object.freeze({id:'melee',label:'Melee',canonicalKey:'v',defaultKey:'v'}),
  Object.freeze({id:'intel',label:'Intel',canonicalKey:'t',defaultKey:'t'}),
  Object.freeze({id:'ping',label:'Ping',canonicalKey:'z',defaultKey:'z'}),
  Object.freeze({id:'scoreboard',label:'Scoreboard',canonicalKey:'tab',defaultKey:'tab'}),
  Object.freeze({id:'menu',label:'Game menu',canonicalKey:'p',defaultKey:'p'}),
]);

const DEFINITION_BY_ID = new Map(KEY_BINDING_DEFINITIONS.map((entry) => [entry.id, entry]));
const CANONICAL_KEYS = new Set(KEY_BINDING_DEFINITIONS.map((entry) => entry.canonicalKey));
const FORBIDDEN_BINDINGS = new Set([
  'escape', 'meta', 'os', 'dead', 'unidentified', 'process', 'compose',
]);

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function canStore(storage) {
  return storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function';
}

function clampStep(value, limits) {
  const number = Number(value);
  if (!Number.isFinite(number)) return limits.default;
  const clamped = Math.max(limits.min, Math.min(limits.max, number));
  const steps = Math.round((clamped - limits.min) / limits.step);
  return Number((limits.min + steps * limits.step).toFixed(4));
}

export function normalizePhysicalKey(value) {
  if (typeof value !== 'string') return null;
  if (value === ' ' || value === 'Spacebar') return ' ';
  const key = String(value).trim().toLowerCase();
  return key || null;
}

export function canBindPhysicalKey(value) {
  const key = normalizePhysicalKey(value);
  return !!key && key.length <= 24 && !FORBIDDEN_BINDINGS.has(key);
}

export function formatKeyLabel(value) {
  const key = normalizePhysicalKey(value);
  if (!key) return 'UNBOUND';
  const labels = {mouse0:'LMB',mouse2:'RMB',
    ' ': 'SPACE',
    control: 'CTRL',
    shift: 'SHIFT',
    alt: 'ALT',
    tab: 'TAB',
    enter: 'ENTER',
    backspace: 'BACKSPACE',
    capslock: 'CAPS LOCK',
    arrowup: '↑',
    arrowdown: '↓',
    arrowleft: '←',
    arrowright: '→',
    pageup: 'PAGE UP',
    pagedown: 'PAGE DOWN',
  };
  return labels[key] || key.toUpperCase();
}

export function canonicalKeyForAction(actionId) {
  return DEFINITION_BY_ID.get(String(actionId || ''))?.canonicalKey ?? null;
}

export function bindingDefinition(actionId) {
  return DEFINITION_BY_ID.get(String(actionId || '')) ?? null;
}

function defaultBindings() {
  return Object.fromEntries(
    KEY_BINDING_DEFINITIONS.map((entry) => [entry.id, entry.defaultKey])
  );
}

function sanitizeBindings(value) {
  const source = value && typeof value === 'object' ? value : {};
  const bindings = {};
  const used = new Set();
  const pending = [];

  // Preserve every valid, unique stored choice first. A second pass repairs
  // malformed/duplicate entries without discarding the rest of the layout.
  for (const definition of KEY_BINDING_DEFINITIONS) {
    const requested = normalizePhysicalKey(source[definition.id] ?? definition.defaultKey);
    if (canBindPhysicalKey(requested) && !used.has(requested)) {
      bindings[definition.id] = requested;
      used.add(requested);
    } else {
      pending.push(definition);
    }
  }

  const fallbackKeys = KEY_BINDING_DEFINITIONS.map((entry) => entry.defaultKey);
  for (const definition of pending) {
    const fallback = [definition.defaultKey, ...fallbackKeys].find((key) => !used.has(key));
    bindings[definition.id] = fallback;
    used.add(fallback);
  }
  return bindings;
}

export default class GameSettings {
  constructor(game = null, storage = defaultStorage()) {
    this.game = game;
    this.storage = storage;
    this.lookSensitivity = SETTINGS_LIMITS.lookSensitivity.default;
    this.brightnessEv = SETTINGS_LIMITS.brightnessEv.default;
    this.modes = {ads:'hold',lean:'hold',crouch:'toggle',walk:'hold'};this.volume=.5;
    this.bindings = defaultBindings();
    this._physicalToCanonical = new Map();
    this._load();
    this._rebuildLookup();
  }

  setMode(action,value){if(!Object.hasOwn(this.modes,action)||!['hold','toggle'].includes(value))return false;this.modes[action]=value;this._commit('modes');return true;}
  setVolume(value){const number=Number(value);if(!Number.isFinite(number))return;this.volume=Math.max(0,Math.min(1,number));this._commit('volume');}

  get(actionId) {
    return this.bindings[String(actionId || '')] ?? null;
  }

  getLabel(actionId) {
    return formatKeyLabel(this.get(actionId));
  }

  isPhysicalBinding(physicalKey) {
    const key = normalizePhysicalKey(physicalKey);
    return !!key && this._physicalToCanonical.has(key);
  }

  setLookSensitivity(value) {
    const next = clampStep(value, SETTINGS_LIMITS.lookSensitivity);
    if (next === this.lookSensitivity) return next;
    this.lookSensitivity = next;
    this._commit('lookSensitivity');
    return next;
  }

  setBrightnessEv(value) {
    const next = clampStep(value, SETTINGS_LIMITS.brightnessEv);
    if (next === this.brightnessEv) return next;
    this.brightnessEv = next;
    this._commit('brightnessEv');
    return next;
  }

  rebind(actionId, physicalKey) {
    const id = String(actionId || '');
    const definition = DEFINITION_BY_ID.get(id);
    const key = normalizePhysicalKey(physicalKey);
    if (!definition || !canBindPhysicalKey(key)) {
      return Object.freeze({ changed: false, rejected: true, actionId: id, key: null });
    }

    const previousKey = this.bindings[id];
    if (key === previousKey) {
      return Object.freeze({ changed: false, rejected: false, actionId: id, key });
    }

    const swappedActionId = KEY_BINDING_DEFINITIONS.find(
      (entry) => entry.id !== id && this.bindings[entry.id] === key
    )?.id ?? null;

    this.bindings[id] = key;
    if (swappedActionId) this.bindings[swappedActionId] = previousKey;
    this._rebuildLookup();
    this._commit('bindings', { actionId: id, key, swappedActionId });
    return Object.freeze({
      changed: true,
      rejected: false,
      actionId: id,
      key,
      swappedActionId,
    });
  }

  /**
   * Translate one physical KeyboardEvent key into the stable semantic key all
   * gameplay systems already consume. A displaced default returns null rather
   * than falling through, otherwise its old action would remain active too.
   */
  resolveInputKey(physicalKey) {
    const key = normalizePhysicalKey(physicalKey);
    if (!key || FORBIDDEN_BINDINGS.has(key)) return null;
    const canonical = this._physicalToCanonical.get(key);
    if (canonical) return canonical;
    return CANONICAL_KEYS.has(key) ? null : key;
  }

  reset() {
    this.lookSensitivity = SETTINGS_LIMITS.lookSensitivity.default;
    this.brightnessEv = SETTINGS_LIMITS.brightnessEv.default;
    this.modes = {ads:'hold',lean:'hold',crouch:'toggle',walk:'hold'};this.volume=.5;
    this.bindings = defaultBindings();
    this._rebuildLookup();
    this._commit('reset');
  }
  resetBindings(){this.bindings=defaultBindings();this._rebuildLookup();this._commit('bindings');}

  snapshot() {
    return Object.freeze({
      modes:{...this.modes},volume:this.volume,lookSensitivity: this.lookSensitivity,
      brightnessEv: this.brightnessEv,
      bindings: Object.freeze({ ...this.bindings }),
    });
  }

  _load() {
    if (!canStore(this.storage)) return;
    try {
      const raw = this.storage.getItem(SETTINGS_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return;
      this.lookSensitivity = clampStep(
        parsed.lookSensitivity,
        SETTINGS_LIMITS.lookSensitivity
      );
      this.brightnessEv = clampStep(parsed.brightnessEv, SETTINGS_LIMITS.brightnessEv);
      this.bindings = sanitizeBindings(parsed.bindings);
      for(const action of Object.keys(this.modes))if(['hold','toggle'].includes(parsed.modes?.[action]))this.modes[action]=parsed.modes[action];
      if(Number.isFinite(parsed.volume))this.volume=Math.max(0,Math.min(1,parsed.volume));
    } catch {
      // Privacy modes and corrupted JSON both fall back to safe defaults.
    }
  }

  _rebuildLookup() {
    this._physicalToCanonical.clear();
    for (const definition of KEY_BINDING_DEFINITIONS) {
      const physical = this.bindings[definition.id];
      this._physicalToCanonical.set(physical, definition.canonicalKey);
    }
  }

  _commit(kind, detail = {}) {
    if (canStore(this.storage)) {
      try {
        this.storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({
          modes:{...this.modes},volume:this.volume,lookSensitivity: this.lookSensitivity,
          brightnessEv: this.brightnessEv,
          bindings: this.bindings,
        }));
      } catch {
        // The setting remains live for this session when persistence is denied.
      }
    }
    this.game?.events?.emit?.('settings:changed', {
      kind,
      ...detail,
      settings: this.snapshot(),
    });
  }
}
