import { games, artUrl } from '../../core/catalog';
import { entryHash } from '../../core/navigation';
import { mountPredictionsStrip } from '../../predictions/library-strip';
import { mountSantaBanner } from '../../santa/banner';
import { libraryMarkup } from '../../ui/library-markup';
import { paintProduced } from '../mount-frame';
import { createMeter } from '../measure';
import type { Layout } from '../types';

/** Unfiltered library: every catalog card, the predictions strip, and the seasonal banner. */
export const collector = {
  id: 'home',
  group: 'shell-glass' as const,
  collect(layout: Layout) {
    const root = document.documentElement;
    const previous = root.dataset.festive;
    root.dataset.festive = 'christmas';
    const host = document.createElement('div');
    host.style.width = `${layout.cssWidth}px`;
    host.style.height = `${layout.cssHeight}px`;
    document.body.append(host);
    try {
      host.innerHTML = libraryMarkup(
        games,
        false,
        '',
        id => artUrl(id as typeof games[number]['id']),
        id => entryHash(id as typeof games[number]['id']),
        `${import.meta.env.BASE_URL}offline/cover.svg`,
      );
      const grid = host.querySelector('.game-grid');
      if (grid) {
        mountPredictionsStrip(grid);
        mountSantaBanner(grid);
      }
      const meter = createMeter();
      meter.fillPixels = paintProduced(host, layout);
      return meter.snapshot();
    } finally {
      host.remove();
      if (previous === undefined) delete root.dataset.festive;
      else root.dataset.festive = previous;
    }
  },
};
