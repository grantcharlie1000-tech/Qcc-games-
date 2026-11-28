import { createMeter, domFillPixels, driveQueuedFrame } from './measure';
import type { FrameMeter } from './measure';
import type { AccountsClient } from '../accounts/client';
import { AccountsClient as Accounts } from '../accounts/client';
import type { AccountStorage } from '../accounts/client';
import type { AppDeps } from '../apps/types';
import type { FrameSnapshot, Layout } from './types';

/** Detached host sized like the floor layout. happy-dom does not compute CSS boxes. */
export function mountHost(layout: Layout): HTMLElement {
  const host = document.createElement('div');
  host.style.width = `${layout.cssWidth}px`;
  host.style.height = `${layout.cssHeight}px`;
  host.style.overflow = 'auto';
  return host;
}

export function gridColumns(cssWidth: number): number {
  if (cssWidth >= 1280) return 6;
  if (cssWidth >= 1024) return 5;
  if (cssWidth >= 768) return 4;
  if (cssWidth >= 640) return 3;
  return 2;
}

/** Poster grid from theme.css: 2/3 art plus a caption, gap 16 from 640px. */
export function posterCard(cssWidth: number): { columns: number; cardW: number; posterH: number; cardH: number } {
  const columns = gridColumns(cssWidth);
  const gap = cssWidth >= 640 ? 16 : 10;
  const cardW = Math.max(1, Math.floor((cssWidth - gap * (columns - 1)) / columns));
  const posterH = Math.round(cardW * 3 / 2);
  return { columns, cardW, posterH, cardH: posterH + 48 };
}

export function paintBox(el: Element, w: number, h: number): void {
  const node = el as HTMLElement;
  if ((node.offsetWidth || 0) > 0 && (node.offsetHeight || 0) > 0) return;
  node.dataset.paintW = String(Math.max(1, Math.round(w)));
  node.dataset.paintH = String(Math.max(1, Math.round(h)));
}

/** Root box plus descendant boxes. Call after layout hooks are restored. */
export function fillOf(root: ParentNode): number {
  let fill = 0;
  if (root instanceof HTMLElement) {
    const w = root.offsetWidth || Number(root.dataset.paintW) || 0;
    const h = root.offsetHeight || Number(root.dataset.paintH) || 0;
    if (w > 0 && h > 0) fill += w * h;
  }
  return fill + domFillPixels(root).fillPixels;
}

/** Structural boxes for one steady-tick row. Icons stay small so overdraw stays the row, not the catalog. */
export function paintRow(root: Element, width: number, height: number): number {
  paintBox(root, width, height);
  for (const el of root.querySelectorAll('*')) {
    const node = el as HTMLElement;
    const tag = node.tagName;
    if (tag === 'SVG' || tag === 'PATH' || tag === 'BUTTON' || node.classList.contains('ui-icon')) paintBox(node, 24, 24);
    else if (tag === 'IMG') paintBox(node, Math.min(width, 320), Math.min(height, 180));
    else paintBox(node, Math.max(1, Math.min(width, 480)), Math.min(height, 22));
  }
  return fillOf(root);
}

function ownText(el: Element): string {
  let text = '';
  for (const child of el.childNodes) if (child.nodeType === 3) text += child.textContent ?? '';
  return text;
}

function stamp(el: Element): string {
  const node = el as HTMLElement;
  const className = typeof node.className === 'string' ? node.className : '';
  return `${node.getAttribute?.('style') ?? ''}\n${className}\n${node.getAttribute?.('hidden') ?? ''}\n${node.getAttribute?.('transform') ?? ''}\n${ownText(el)}`;
}

const LAYOUT_NAMES = ['offsetWidth', 'offsetHeight', 'clientWidth', 'clientHeight', 'scrollWidth', 'scrollHeight'] as const;

function elementsIn(root: ParentNode): Element[] {
  const list: Element[] = [];
  if (root instanceof Element) list.push(root);
  root.querySelectorAll?.('*').forEach(node => { if (node instanceof Element) list.push(node); });
  return list;
}

/** Counts layout reads, new nodes, and nodes whose own style or text the tick changes. Restores hooks. */
export function steady(root: ParentNode, tick: () => void): { animatedDom: number; allocations: number; layoutReads: number } {
  const before = new Map<Element, string>();
  for (const el of elementsIn(root)) before.set(el, stamp(el));
  let reads = 0;
  const restores: Array<() => void> = [];
  const rect = Element.prototype.getBoundingClientRect;
  Element.prototype.getBoundingClientRect = function (this: Element) {
    reads += 1;
    return rect.call(this);
  };
  restores.push(() => { Element.prototype.getBoundingClientRect = rect; });
  const hook = (proto: object, name: string) => {
    const desc = Object.getOwnPropertyDescriptor(proto, name);
    if (!desc?.get || !desc.configurable) return;
    Object.defineProperty(proto, name, {
      configurable: true, enumerable: desc.enumerable,
      get() { reads += 1; return desc.get!.call(this); },
    });
    restores.push(() => Object.defineProperty(proto, name, desc));
  };
  for (const name of LAYOUT_NAMES) hook(HTMLElement.prototype, name);
  const gcs = window.getComputedStyle.bind(window);
  window.getComputedStyle = ((elt: Element, pseudo?: string | null) => {
    reads += 1;
    return gcs(elt, pseudo);
  }) as typeof window.getComputedStyle;
  restores.push(() => { window.getComputedStyle = gcs; });
  try { tick(); }
  finally { for (const restore of restores.reverse()) restore(); }
  let animatedDom = 0;
  let allocations = 0;
  for (const el of elementsIn(root)) {
    if (!before.has(el)) allocations += 1;
    else if (before.get(el) !== stamp(el)) animatedDom += 1;
  }
  return { animatedDom, allocations, layoutReads: reads };
}

export function take(meter: FrameMeter, root: ParentNode, tick: () => void, paint: () => number): FrameSnapshot {
  const work = steady(root, tick);
  meter.fillPixels = paint();
  meter.animatedDom = work.animatedDom;
  meter.allocations = work.allocations;
  meter.layoutReads = work.layoutReads;
  meter.gpuReadbacks = 0;
  return meter.snapshot();
}

/** Drops listeners a view adds and never removes. */
export function listenScope(): () => void {
  const added: [EventTarget, string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][] = [];
  const restores: Array<() => void> = [];
  for (const target of [window, document]) {
    const orig = target.addEventListener;
    try {
      target.addEventListener = function (this: EventTarget, type: string, listener: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) {
        added.push([target, type, listener, options]);
        return orig.call(this, type, listener, options);
      } as typeof target.addEventListener;
      restores.push(() => { target.addEventListener = orig; });
    } catch { /* native method stays */ }
  }
  return () => {
    for (const restore of restores) restore();
    for (const [target, type, listener, options] of added) target.removeEventListener(type, listener, options);
  };
}

export function memoryAccounts(): AccountsClient {
  const storage: AccountStorage = {
    read: <T>(_key: string, fallback: T) => fallback,
    write: () => true,
    remove: () => true,
    keys: () => [],
    subscribe: () => () => {},
  };
  return new Accounts(storage);
}

export function appDeps(): AppDeps {
  return {
    accounts: memoryAccounts(),
    openAccounts() {},
    reducedMotion: () => true,
    openMenu() {},
    openApps() {},
    appsBadge: () => () => {},
  };
}

export { createMeter, driveQueuedFrame };
