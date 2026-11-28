import { games } from '../../core/catalog';
import { Downloads, type Status } from '../../offline/downloads';
import { DownloadsView } from '../../offline/view';
import { createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface Lists { paint(): void; paintRow(id: string): void }
interface Live { live: Map<string, Status> }

export const collector = {
  id: 'downloads',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const downloads = new Downloads();
    const id = games[0].id;
    const live = (downloads as unknown as Live).live;
    live.set(id, { state: 'downloading', done: 200_000, total: 1_000_000 });
    const gate = Downloads as { supported: () => boolean };
    const supported = gate.supported;
    gate.supported = () => true;
    let view: DownloadsView;
    try { view = new DownloadsView(host, downloads); }
    finally { gate.supported = supported; }
    const meter = createMeter();
    try {
      const page = view as unknown as Lists;
      page.paint();
      const row = host.querySelector(`.dl-row[data-game="${id}"]`);
      if (!row) throw new Error('downloads list was empty');
      return take(meter, host, () => {
        live.set(id, { state: 'downloading', done: 450_000, total: 1_000_000 });
        page.paintRow(id);
      }, () => paintRow(row, layout.cssWidth, 82));
    } finally {
      view.dispose();
      release();
    }
  },
};
