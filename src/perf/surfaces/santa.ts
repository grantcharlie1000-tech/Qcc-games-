import { STOP_MINUTES } from '../../santa/tracker/route';
import { TrackerPanel } from '../../santa/tracker/view';
import { createMeter, fillOf, listenScope, mountHost, paintBox, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'santa',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const panel = new TrackerPanel(host, { reducedMotion: () => false });
    const meter = createMeter();
    try {
      const departure = Date.UTC(2026, 11, 24, 10, 0, 0);
      const landed = departure + (10 + STOP_MINUTES / 2) * 60_000;
      panel.update(landed, departure);
      const bar = host.querySelector('.trk-progress');
      const sleigh = host.querySelector('.trk-sleigh');
      if (!bar || !sleigh) throw new Error('santa tracker missing');
      const width = Math.min(layout.cssWidth, 720);
      return take(meter, host, () => { panel.update(landed + 1000, departure); }, () => {
        paintBox(bar, width, 8);
        for (const child of bar.children) paintBox(child, width, 8);
        return fillOf(bar) + paintRow(sleigh, 22, 22);
      });
    } finally {
      panel.dispose();
      release();
    }
  },
};
