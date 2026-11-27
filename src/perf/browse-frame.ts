import catalogJson from '../../public/movies/catalog.json';
import { parseCatalog } from '../movies/model';
import type { MovieKind } from '../movies/model';
import { MovieStorage } from '../movies/storage';
import { MoviesView } from '../movies/view';
import { createMeter, driveQueuedFrame, fillOf, listenScope, mountHost, paintBox, posterCard, take } from './app-frame';
import type { FrameSnapshot, Layout } from './types';

interface BrowsePage {
  catalog: ReturnType<typeof parseCatalog>;
  ready: boolean;
  failed: boolean;
  kind: MovieKind;
  route: { play: boolean };
  render(): void;
  root: HTMLElement;
}

/** One poster row the browse grid keeps. The shipped view is not virtualized, so the kind grid is mounted; the steady tick is the next row. */
function paintCard(card: Element, cardW: number, posterH: number, cardH: number): number {
  paintBox(card, cardW, cardH);
  const poster = card.querySelector('.ui-card-poster');
  if (poster) {
    paintBox(poster, cardW, posterH);
    for (const child of poster.children) {
      const el = child as HTMLElement;
      if (el.classList.contains('ui-card-chips')) paintBox(el, Math.min(cardW, 120), 18);
      else if (el.classList.contains('ui-card-play')) paintBox(el, 40, 40);
      else paintBox(el, cardW, posterH);
      for (const grand of el.children) {
        const node = grand as HTMLElement;
        if (node.classList.contains('ui-chip')) paintBox(node, 48, 16);
        else if (node.classList.contains('ui-icon') || node.tagName === 'SVG') paintBox(node, 24, 24);
        else paintBox(node, Math.min(cardW, 96), 16);
      }
    }
  }
  const caption = card.querySelector('.ui-card-caption');
  if (caption) {
    paintBox(caption, cardW, 40);
    for (const child of caption.children) paintBox(child, cardW, 16);
  }
  return fillOf(card);
}

export function collectBrowse(kind: 'movie' | 'tv', layout: Layout): FrameSnapshot {
  const release = listenScope();
  const host = mountHost(layout);
  const view = new MoviesView(host, new MovieStorage(), () => {}, true);
  const meter = createMeter();
  try {
    const page = view as unknown as BrowsePage;
    page.catalog = parseCatalog(catalogJson);
    page.ready = true;
    page.failed = false;
    page.kind = kind;
    page.route = { play: false };
    page.render();
    const cards = [...page.root.querySelectorAll<HTMLElement>('.movies-results-grid > .ui-card')];
    const { columns, cardW, posterH, cardH } = posterCard(layout.cssWidth);
    const start = cards.length > columns ? columns : 0;
    const row = cards.slice(start, start + Math.max(1, Math.min(columns, cards.length)));
    if (!row.length) throw new Error(`${kind} browse grid was empty`);
    return take(meter, page.root, () => {
      driveQueuedFrame(() => {
        page.root.scrollTop += cardH;
        page.root.dispatchEvent(new Event('scroll'));
      });
    }, () => row.reduce((sum, card) => sum + paintCard(card, cardW, posterH, cardH), 0));
  } finally {
    view.dispose();
    release();
  }
}
