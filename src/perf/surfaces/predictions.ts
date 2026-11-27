import { PredictionsView } from '../../predictions/view';
import { closingText } from '../../predictions/model';
import type { MarketSummary } from '../../predictions/shared';
import { appDeps, createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface Cards { panel: HTMLElement; card(market: MarketSummary): string }

const LIMIT = 60;

export const collector = {
  id: 'predictions',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const view = new PredictionsView(host, appDeps());
    const meter = createMeter();
    try {
      const page = view as unknown as Cards;
      const closeAt = new Date(Date.now() + 86_400_000).toISOString();
      const markets: MarketSummary[] = Array.from({ length: LIMIT }, (_, i) => ({
        id: `m${i + 1}`,
        question: `Will question ${i + 1} resolve this term?`,
        category: 'school',
        audience: 'public',
        state: 'open',
        closeAt,
        resolveAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
        publishedAt: new Date().toISOString(),
        yesPpm: 500_000,
        traders: 4,
        trades: 2,
        fixture: false,
        outcome: null,
      }));
      page.panel.innerHTML = `<ul class="pr-grid" role="list">${markets.map(market => page.card(market)).join('')}</ul>`;
      const card = page.panel.querySelector('.pr-card:last-child');
      const foot = card?.querySelector<HTMLElement>('.pr-card-foot span');
      if (!card || !foot) throw new Error('predictions board was empty');
      return take(meter, page.panel, () => {
        page.panel.scrollTop += 120;
        foot.textContent = closingText('open', closeAt, Date.now() + 3 * 86_400_000);
      }, () => paintRow(card, Math.min(layout.cssWidth, 420), 160));
    } finally {
      view.dispose();
      release();
    }
  },
};
