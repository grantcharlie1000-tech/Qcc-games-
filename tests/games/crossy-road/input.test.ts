import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Dir } from '../../../src/games/crossy-road/config';
import { attachInput, classifySwipe, keyAction, type Action, type InputOptions } from '../../../src/games/crossy-road/input';

describe('classifySwipe', () => {
  // [dx, dy, want] in screen coordinates (y grows downward). A swipe is >= 24 px with one axis >= 1.5x the other;
  // a tap and an ambiguous diagonal both hop forward.
  const cases: [number, number, Dir][] = [
    [0, 0, 'up'],
    [23, 0, 'up'],
    [24, 0, 'right'],
    [-24, 0, 'left'],
    [0, -24, 'up'],
    [0, 24, 'down'],
    // The 24 px minimum applies to both axes and both signs: a naive "pick the dominant axis" would say right/left/down.
    [-23, 0, 'up'],
    [0, 23, 'up'],
    // Exactly 1.5x is dominant; just under is an ambiguous diagonal.
    [36, 24, 'right'],
    [35, 24, 'up'],
    [24, 36, 'down'],
    [24, 35, 'up'],
    [-10, -40, 'up'],
    [10, 40, 'down'],
    [1000, 999, 'up'],
    // Signs: dominance compares magnitudes, so a leftward swipe with some vertical drift is still left.
    [-60, 20, 'left'],
    [-36, -24, 'left'],
    [-35, -24, 'up'],
    [-20, 60, 'down'],
    [20, -60, 'up'],
    [-30, 30, 'up'],
    [30, 30, 'up'],
  ];
  it.each(cases)('(%i, %i) -> %s', (dx, dy, want) => {
    expect(classifySwipe(dx, dy)).toBe(want);
  });
});

describe('keyAction', () => {
  const cases: [string, Action | null][] = [
    ['ArrowUp', 'up'], ['w', 'up'], ['W', 'up'],
    ['ArrowDown', 'down'], ['s', 'down'], ['S', 'down'],
    ['ArrowLeft', 'left'], ['a', 'left'], ['A', 'left'],
    ['ArrowRight', 'right'], ['d', 'right'], ['D', 'right'],
    ['p', 'pause'], ['P', 'pause'],
    // Space is ' ' in current browsers and 'Spacebar' in old ones.
    [' ', 'again'], ['Spacebar', 'again'], ['Enter', 'again'], ['r', 'again'], ['R', 'again'],
    // Escape belongs to the shell; Tab must keep moving focus.
    ['Escape', null], ['Tab', null], ['Shift', null], ['q', null], ['Unidentified', null], ['', null],
  ];
  it.each(cases)('%j -> %j', (key, want) => {
    expect(keyAction(key)).toBe(want);
  });
});

// --- attachInput harness -------------------------------------------------------------------------------------
// The suite runs in Node, so there is no DOM. Keys go through a real EventTarget, so listener options and AbortSignal
// removal behave exactly as in a browser. The stage is an EventTarget with the few canvas methods the module calls.
// Elements are fakes whose closest() really evaluates the selectors the module passes, so a wrong selector fails.

type Attrs = Record<string, string>;
interface FakeElement { tag: string; attrs: Attrs; parent: FakeElement | null; closest(selector: string): FakeElement | null }

const ATTRIBUTE = String.raw`\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]`;
/** One comma-separated part: `tag`, `tag:not([a=v])`, `[a]`, `[a=v]`, `[a="v"]` or `tag[a]`. */
const SIMPLE_SELECTOR = new RegExp(String.raw`^([a-z]*)(?::not\(${ATTRIBUTE}\))?(?:${ATTRIBUTE})?$`);

function matches(selector: string, tag: string, attrs: Attrs): boolean {
  return selector.split(',').some(part => {
    const parsed = SIMPLE_SELECTOR.exec(part.trim());
    if (!parsed) throw new Error(`the fake element cannot evaluate the selector "${part.trim()}"`);
    const [, wantTag, notName, notValue, name, value] = parsed;
    const has = (n: string, v: string | undefined) => n in attrs && (v === undefined || attrs[n] === v);
    if (wantTag && wantTag !== tag) return false;
    if (notName && has(notName, notValue)) return false;
    return !name || has(name, value);
  });
}

function element(tag: string, attrs: Attrs = {}, parent: FakeElement | null = null): FakeElement {
  const self: FakeElement = {
    tag, attrs, parent,
    closest(selector) {
      for (let node: FakeElement | null = self; node; node = node.parent) if (matches(selector, node.tag, node.attrs)) return node;
      return null;
    },
  };
  return self;
}

/** Replaces `document` with one that contains only `present`. */
function stubDocument(present: FakeElement[] = []): void {
  vi.stubGlobal('document', { querySelector: (selector: string) => present.find(node => matches(selector, node.tag, node.attrs)) ?? null });
}
afterEach(() => { vi.unstubAllGlobals(); });

class FakeStage extends EventTarget {
  readonly captured: number[] = [];
  readonly released: number[] = [];
  readonly focused: unknown[] = [];
  captureError: Error | null = null;
  releaseError: Error | null = null;
  setPointerCapture(id: number): void {
    if (this.captureError) throw this.captureError;
    this.captured.push(id);
  }
  releasePointerCapture(id: number): void {
    if (this.releaseError) throw this.releaseError;
    this.released.push(id);
  }
  focus(options?: unknown): void { this.focused.push(options); }
}

interface KeyInit { repeat?: boolean; ctrlKey?: boolean; altKey?: boolean; metaKey?: boolean; target?: unknown }
/** A cancelable keydown with the KeyboardEvent fields the module reads. `target` overrides event.target, as if the key bubbled from that element. */
function keydown(key: string, { target, ...flags }: KeyInit = {}): Event {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...flags });
  if (target !== undefined) Object.defineProperty(event, 'target', { value: target });
  return event;
}

interface PointerInit { pointerId?: number; isPrimary?: boolean; button?: number; pointerType?: string; clientX?: number; clientY?: number }
/** A cancelable pointer event with the PointerEvent fields the module reads; by default a primary touch at the origin. */
function pointer(type: string, init: PointerInit = {}): Event {
  return Object.assign(new Event(type, { cancelable: true }), { pointerId: 1, isPrimary: true, button: 0, pointerType: 'touch', clientX: 0, clientY: 0, ...init });
}

/** Attaches input with every callback logging into `calls` ('dir:up', 'pause', 'again'), so "nothing happened" is one assertion. */
function setup(overrides: Partial<InputOptions> = {}) {
  const keys = new EventTarget();
  const stage = new FakeStage();
  const controller = new AbortController();
  const calls: string[] = [];
  const state = { enabled: true, againStartsRun: false };
  attachInput({
    target: stage as unknown as HTMLElement,
    signal: controller.signal,
    enabled: () => state.enabled,
    onDir: dir => { calls.push(`dir:${dir}`); },
    onPause: () => { calls.push('pause'); },
    onAgain: () => { calls.push('again'); return state.againStartsRun; },
    keyTarget: keys,
    blocked: () => false,
    ...overrides,
  });
  const press = (key: string, init?: KeyInit): Event => {
    const event = keydown(key, init);
    keys.dispatchEvent(event);
    return event;
  };
  const fire = (type: string, init?: PointerInit): Event => {
    const event = pointer(type, init);
    stage.dispatchEvent(event);
    return event;
  };
  return { keys, stage, controller, calls, state, press, fire };
}

describe('attachInput: keyboard', () => {
  it('hops forward on ArrowUp and swallows the key', () => {
    const { press, calls } = setup();
    const event = press('ArrowUp');
    expect(calls).toEqual(['dir:up']);
    expect(event.defaultPrevented).toBe(true);
  });

  const dirKeys: [string, Dir][] = [
    ['ArrowUp', 'up'], ['W', 'up'], ['ArrowDown', 'down'], ['s', 'down'],
    ['ArrowLeft', 'left'], ['A', 'left'], ['ArrowRight', 'right'], ['d', 'right'],
  ];
  it.each(dirKeys)('%s hops %s', (key, dir) => {
    const { press, calls } = setup();
    press(key);
    expect(calls).toEqual([`dir:${dir}`]);
  });

  it.each([['ArrowUp', 'dir:up'], ['p', 'pause'], [' ', 'again'], ['Enter', 'again'], ['r', 'again']])(
    'holding %j acts once: its key repeats do nothing', (key, call) => {
      const { press, calls } = setup();
      press(key);
      for (let i = 0; i < 3; i++) press(key, { repeat: true });
      expect(calls).toEqual([call]);
    });

  it('never touches Escape, so the shell can open the Study article', () => {
    const { keys, press, calls, state } = setup();
    state.againStartsRun = true;
    let reachedLaterListener = false;
    keys.addEventListener('keydown', () => { reachedLaterListener = true; });
    const event = press('Escape');
    expect(calls).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
    expect(event.cancelBubble).toBe(false);
    expect(reachedLaterListener).toBe(true);
  });

  it('leaves direction keys alone while directional input is disabled', () => {
    const { press, calls, state } = setup();
    state.enabled = false;
    const event = press('ArrowUp');
    expect(calls).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('pauses on P and swallows the key', () => {
    for (const key of ['p', 'P']) {
      const { press, calls } = setup();
      const event = press(key);
      expect(calls).toEqual(['pause']);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  it('still pauses while directional input is disabled, so a paused game can be resumed', () => {
    const { press, calls, state } = setup();
    state.enabled = false;
    press('p');
    expect(calls).toEqual(['pause']);
  });

  it.each([' ', 'Spacebar', 'Enter', 'r', 'R'])('%j asks for a new run and swallows the key only when one started', key => {
    const started = setup();
    started.state.againStartsRun = true;
    const consumed = started.press(key);
    expect(started.calls).toEqual(['again']);
    expect(consumed.defaultPrevented).toBe(true);

    const refused = setup();
    const untouched = refused.press(key);
    expect(refused.calls).toEqual(['again']);
    expect(untouched.defaultPrevented).toBe(false);
  });

  it('still starts a new run while directional input is disabled (the game-over state)', () => {
    const { press, calls, state } = setup();
    state.enabled = false;
    state.againStartsRun = true;
    const event = press(' ');
    expect(calls).toEqual(['again']);
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves Ctrl, Alt and Meta shortcuts to the browser (reload, print, back)', () => {
    for (const flag of ['ctrlKey', 'altKey', 'metaKey'] as const) {
      for (const key of ['ArrowUp', 'ArrowLeft', 'p', 'r']) {
        const { press, calls, state } = setup();
        state.againStartsRun = true;
        const event = press(key, { [flag]: true });
        expect(calls, `${flag} + ${key}`).toEqual([]);
        expect(event.defaultPrevented, `${flag} + ${key}`).toBe(false);
      }
    }
  });

  it('ignores every action while the blocked guard says a dialog or text field has the keys', () => {
    const seen: Event[] = [];
    const { press, calls, state } = setup({ blocked: event => { seen.push(event); return true; } });
    state.againStartsRun = true;
    const events = ['ArrowUp', 'p', ' '].map(key => press(key));
    expect(calls).toEqual([]);
    expect(events.map(event => event.defaultPrevented)).toEqual([false, false, false]);
    expect(seen).toHaveLength(3);
    seen.forEach((event, i) => expect(event).toBe(events[i]));
  });

  describe('when the key comes from a focused button, link or role=button element', () => {
    const button = element('button');
    const targets: [string, FakeElement][] = [
      ['a button', button],
      ['a link', element('a')],
      ['a role=button element', element('div', { role: 'button' })],
      ['a label inside a button', element('span', {}, button)],
    ];
    it.each(targets)('Space and Enter on %s are left to its own activation', (_name, target) => {
      for (const key of [' ', 'Spacebar', 'Enter']) {
        const { press, calls, state } = setup();
        state.againStartsRun = true;
        const event = press(key, { target });
        expect(calls, key).toEqual([]);
        expect(event.defaultPrevented, key).toBe(false);
      }
    });

    // Only Space and Enter activate a focused control, so R has no native action there and must always reach the game.
    it.each(targets)('R on %s still asks for a new run, and swallows the key only when one started', (_name, target) => {
      for (const key of ['r', 'R']) {
        const started = setup();
        started.state.againStartsRun = true;
        const consumed = started.press(key, { target });
        expect(started.calls, key).toEqual(['again']);
        expect(consumed.defaultPrevented, key).toBe(true);

        const refused = setup();
        const untouched = refused.press(key, { target });
        expect(refused.calls, key).toEqual(['again']);
        expect(untouched.defaultPrevented, key).toBe(false);
      }
    });

    it('still handles Space on the playfield itself', () => {
      const { press, calls } = setup();
      press(' ', { target: element('canvas', { tabindex: '0' }) });
      expect(calls).toEqual(['again']);
    });
  });

  it.each(['Tab', 'q', 'Shift'])('does not swallow %j', key => {
    const { press, calls } = setup();
    const event = press(key);
    expect(calls).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('ignores a keydown that carries no key (browser autofill dispatches these)', () => {
    // A throw inside a listener surfaces as an unhandled error and fails the whole run.
    const { keys, calls } = setup();
    keys.dispatchEvent(new Event('keydown', { cancelable: true }));
    expect(calls).toEqual([]);
  });

  it('listens on window when no key target is given', () => {
    const fakeWindow = new EventTarget();
    vi.stubGlobal('window', fakeWindow);
    const dirs: Dir[] = [];
    attachInput({
      target: new FakeStage() as unknown as HTMLElement,
      signal: new AbortController().signal,
      enabled: () => true,
      onDir: dir => { dirs.push(dir); },
      onPause: () => {},
      onAgain: () => false,
    });
    fakeWindow.dispatchEvent(keydown('ArrowUp'));
    expect(dirs).toEqual(['up']);
  });
});

describe('attachInput: pointer', () => {
  // Every gesture starts at (200, 300); the swipe is the release's offset from the press, not its absolute position.
  const start = { clientX: 200, clientY: 300 };
  const release = (dx: number, dy: number) => ({ clientX: 200 + dx, clientY: 300 + dy });

  it('hops forward on a tap, decided on release rather than on press', () => {
    const { fire, calls } = setup();
    fire('pointerdown', start);
    expect(calls).toEqual([]);
    fire('pointerup', release(0, 0));
    expect(calls).toEqual(['dir:up']);
  });

  const swipes: [number, number, Dir][] = [[-60, 0, 'left'], [60, 0, 'right'], [0, -60, 'up'], [0, 60, 'down'], [-60, 20, 'left'], [40, 40, 'up']];
  it.each(swipes)('a release %i px across and %i px down hops %s', (dx, dy, want) => {
    const { fire, calls } = setup();
    fire('pointerdown', start);
    fire('pointerup', release(dx, dy));
    expect(calls).toEqual([`dir:${want}`]);
  });

  it('measures every gesture from its own press, even though a mouse reuses pointer id 1', () => {
    const { fire, calls } = setup();
    fire('pointerdown', { clientX: 200, clientY: 300 });
    fire('pointerup', { clientX: 140, clientY: 300 });
    fire('pointerdown', { clientX: 50, clientY: 50 });
    fire('pointerup', { clientX: 110, clientY: 50 });
    expect(calls).toEqual(['dir:left', 'dir:right']);
  });

  it('does not hop while the pointer moves, only when it is released', () => {
    const { fire, calls } = setup();
    fire('pointerdown', start);
    fire('pointermove', release(-100, 0));
    expect(calls).toEqual([]);
    fire('pointerup', release(-100, 0));
    expect(calls).toEqual(['dir:left']);
  });

  it('captures the pointer, swallows the press and focuses the playfield without scrolling the page', () => {
    const { fire, stage } = setup();
    const down = fire('pointerdown', { ...start, pointerId: 7 });
    expect(stage.captured).toEqual([7]);
    expect(down.defaultPrevented).toBe(true);
    expect(stage.focused).toEqual([{ preventScroll: true }]);
  });

  it('releases the capture when the pointer comes up', () => {
    const { fire, stage } = setup();
    fire('pointerdown', { ...start, pointerId: 7 });
    fire('pointerup', { ...release(0, 0), pointerId: 7 });
    expect(stage.released).toEqual([7]);
  });

  it.each(['pointercancel', 'lostpointercapture'])('%s forgets the pointer without hopping', type => {
    const { fire, calls } = setup();
    fire('pointerdown', start);
    fire(type);
    fire('pointerup', release(-100, 0));
    expect(calls).toEqual([]);
    // The state is clean: the next gesture works.
    fire('pointerdown', start);
    fire('pointerup', release(60, 0));
    expect(calls).toEqual(['dir:right']);
  });

  it.each(['pointercancel', 'lostpointercapture'])('%s for another pointer does not end the gesture', type => {
    const { fire, calls } = setup();
    fire('pointerdown', { ...start, pointerId: 1 });
    fire(type, { pointerId: 2, isPrimary: false });
    fire('pointerup', { ...release(-60, 0), pointerId: 1 });
    expect(calls).toEqual(['dir:left']);
  });

  const secondPointers: [string, PointerInit][] = [
    ['a second finger', { pointerId: 2, isPrimary: false }],
    ['a mouse while touching', { pointerId: 2, isPrimary: true, pointerType: 'mouse' }],
  ];
  it.each(secondPointers)('ignores %s while a pointer is already down', (_name, other) => {
    const { fire, calls, stage } = setup();
    fire('pointerdown', { ...start, pointerId: 1 });
    const second = fire('pointerdown', { ...other, clientX: 50, clientY: 50 });
    fire('pointerup', { ...other, clientX: 400, clientY: 50 });
    expect(second.defaultPrevented).toBe(false);
    expect(stage.captured).toEqual([1]);
    expect(calls).toEqual([]);
    fire('pointerup', { ...release(-60, 0), pointerId: 1 });
    expect(calls).toEqual(['dir:left']);
  });

  it('ignores the middle and right mouse buttons, so the context menu still works', () => {
    for (const button of [1, 2]) {
      const { fire, calls, stage } = setup();
      const down = fire('pointerdown', { ...start, pointerType: 'mouse', button });
      fire('pointerup', { ...release(-60, 0), pointerType: 'mouse', button });
      expect(down.defaultPrevented, `button ${button}`).toBe(false);
      expect(stage.captured, `button ${button}`).toEqual([]);
      expect(calls, `button ${button}`).toEqual([]);
    }
  });

  // Only a mouse is held to its primary button; any touch or pen contact counts.
  const accepted: [string, number][] = [['mouse', 0], ['touch', 0], ['pen', 0], ['pen', 2]];
  it.each(accepted)('accepts a %s press with button %i', (pointerType, button) => {
    const { fire, calls } = setup();
    fire('pointerdown', { ...start, pointerType, button });
    fire('pointerup', { ...release(0, 60), pointerType });
    expect(calls).toEqual(['dir:down']);
  });

  it('never starts a gesture from a non-primary pointer, even when nothing else is down', () => {
    const { fire, calls, stage } = setup();
    const down = fire('pointerdown', { ...start, pointerId: 2, isPrimary: false });
    fire('pointerup', { ...release(-60, 0), pointerId: 2, isPrimary: false });
    expect(down.defaultPrevented).toBe(false);
    expect(stage.captured).toEqual([]);
    expect(calls).toEqual([]);
  });

  it('does not hop while directional input is disabled, and forgets the pointer all the same', () => {
    const { fire, calls, state } = setup();
    state.enabled = false;
    fire('pointerdown', start);
    fire('pointerup', release(-60, 0));
    expect(calls).toEqual([]);
    state.enabled = true;
    fire('pointerdown', start);
    fire('pointerup', release(-60, 0));
    expect(calls).toEqual(['dir:left']);
  });

  it('checks that directional input is enabled when the pointer is released, not when it was pressed', () => {
    const { fire, calls, state } = setup();
    fire('pointerdown', start);
    state.enabled = false;
    fire('pointerup', release(-60, 0));
    expect(calls).toEqual([]);
  });

  it('still works when the pointer can no longer be captured or released', () => {
    const { fire, calls, stage } = setup();
    stage.captureError = new DOMException('No such pointer', 'NotFoundError');
    stage.releaseError = new DOMException('No such pointer', 'NotFoundError');
    fire('pointerdown', start);
    fire('pointerup', release(-60, 0));
    fire('pointerdown', start);
    fire('pointerup', release(0, 0));
    expect(calls).toEqual(['dir:left', 'dir:up']);
  });
});

// With no `blocked` option the module runs its own DOM check, against a stubbed `document` and fake elements.
describe('attachInput: default guard', () => {
  it('ignores keys while a dialog is open', () => {
    stubDocument([element('dialog', { open: '' })]);
    const { press, calls } = setup({ blocked: undefined });
    const event = press('ArrowUp');
    expect(calls).toEqual([]);
    expect(event.defaultPrevented).toBe(false);
  });

  it('keeps playing while a dialog exists but is closed', () => {
    stubDocument([element('dialog')]);
    const { press, calls } = setup({ blocked: undefined });
    press('ArrowUp');
    expect(calls).toEqual(['dir:up']);
  });

  const typing: [string, FakeElement][] = [
    ['a text input', element('input', { type: 'text' })],
    ['an input with no type', element('input')],
    ['a checkbox', element('input', { type: 'checkbox' })],
    ['a textarea', element('textarea')],
    ['a select', element('select')],
    ['a contenteditable element', element('div', { contenteditable: 'true' })],
    ['an empty-valued contenteditable element', element('div', { contenteditable: '' })],
    ['an element inside an editable region', element('span', {}, element('div', { contenteditable: 'true' }))],
  ];
  it.each(typing)('ignores keys typed into %s', (_name, target) => {
    stubDocument();
    for (const key of ['ArrowUp', 'w', 'p', ' ']) {
      const { press, calls, state } = setup({ blocked: undefined });
      state.againStartsRun = true;
      const event = press(key, { target });
      expect(calls, key).toEqual([]);
      expect(event.defaultPrevented, key).toBe(false);
    }
  });

  const notTyping: [string, FakeElement][] = [
    ['the playfield canvas', element('canvas', { tabindex: '0' })],
    ['a range slider', element('input', { type: 'range' })],
    ['an element that is not editable', element('div', { contenteditable: 'false' })],
  ];
  it.each(notTyping)('keeps playing when focus is on %s', (_name, target) => {
    stubDocument();
    const { press, calls } = setup({ blocked: undefined });
    press('ArrowUp', { target });
    expect(calls).toEqual(['dir:up']);
  });

  it('works on a host with no document at all', () => {
    const { press, calls } = setup({ blocked: undefined });
    press('ArrowUp');
    expect(calls).toEqual(['dir:up']);
  });
});

describe('attachInput: registration and cleanup', () => {
  it('stops reacting to keys and pointers once the signal aborts', () => {
    const { press, fire, calls, controller, state } = setup();
    state.againStartsRun = true;
    press('ArrowUp');
    expect(calls).toEqual(['dir:up']);
    fire('pointerdown', { clientX: 200, clientY: 300 });
    controller.abort();
    press('ArrowUp');
    press('p');
    press(' ');
    fire('pointerup', { clientX: 140, clientY: 300 });
    fire('pointerdown', { clientX: 200, clientY: 300 });
    fire('pointerup', { clientX: 200, clientY: 300 });
    expect(calls).toEqual(['dir:up']);
  });

  it('registers every listener with the signal and in the bubble phase, with one keydown listener on the key target', () => {
    const keys = new EventTarget();
    const stage = new FakeStage();
    const onKeys = vi.spyOn(keys, 'addEventListener');
    const onStage = vi.spyOn(stage, 'addEventListener');
    const { controller } = setup({ keyTarget: keys, target: stage as unknown as HTMLElement });

    expect(onKeys.mock.calls.map(([type]) => type)).toEqual(['keydown']);
    expect(onStage.mock.calls.map(([type]) => type)).toEqual(expect.arrayContaining(['pointerdown', 'pointerup', 'pointercancel', 'lostpointercapture']));
    for (const [type, , options] of [...onKeys.mock.calls, ...onStage.mock.calls]) {
      const { signal, capture } = options as AddEventListenerOptions;
      expect(signal, `${type} uses the signal`).toBe(controller.signal);
      expect(capture ?? false, `${type} is not a capture listener`).toBe(false);
    }
  });
});
