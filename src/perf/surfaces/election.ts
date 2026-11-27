import { ElectionView } from '../../election/view';
import type { ElectionBundle, FeedElectorate } from '../../election/model';
import { createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface Results {
  bundle: ElectionBundle;
  tab: string;
  detail: number | undefined;
  renderPanel(focus: boolean): void;
  renderStatus(): void;
}

const GENERAL = 65;
const MAORI = ['Hauraki-Waikato', 'Ikaroa-Rāwhiti', 'Tāmaki Makaurau', 'Te Tai Hauāuru', 'Te Tai Tokerau', 'Te Tai Tonga', 'Waiariki'] as const;

function race(id: number, name: string, kind: FeedElectorate['kind']): FeedElectorate {
  return {
    id, name, kind, final: false, updated: '2026-11-27T00:00:00Z', available: true,
    placesCounted: 12, placesTotal: 40, placesPercent: 30, votesCast: 1800,
    partyInformals: 4, candidateInformals: 6,
    candidates: [
      { id: id * 10, name: 'NGATA, Hana', party: 1, listNo: 1, votes: 1000 },
      { id: id * 10 + 1, name: 'BROWN, Alex', party: 2, listNo: 2, votes: 700 },
    ],
    partyVotes: [{ party: 1, votes: 1100 }, { party: 2, votes: 640 }],
  };
}

function bundle(): ElectionBundle {
  const electorates = [
    ...Array.from({ length: GENERAL }, (_, i) => race(i + 1, `Electorate ${i + 1}`, 'general')),
    ...MAORI.map((name, i) => race(200 + i, name, 'maori')),
  ];
  return {
    source: 'floor', fetchedAt: '2026-11-27T00:00:00Z', updated: '2026-11-27T00:00:00Z',
    stats: {
      placesCounted: 800, placesTotal: 2800, placesPercent: 28, votesCast: 120000, votesPercent: 22,
      electoratesFinal: 0, electoratesPercent: 0, specialVotes: 0, electors: 3500000,
    },
    parties: [
      { id: 1, abbrev: 'LAB', name: 'Labour', registered: true, votes: 60000, percent: 40, listSeats: 15, electorateSeats: 20, seats: 35 },
      { id: 2, abbrev: 'NAT', name: 'National', registered: true, votes: 50000, percent: 34, listSeats: 12, electorateSeats: 18, seats: 30 },
    ],
    electorates,
    lists: {},
  };
}

export const collector = {
  id: 'election',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const view = new ElectionView(host, { reducedMotion: () => true });
    const meter = createMeter();
    try {
      const page = view as unknown as Results;
      page.bundle = bundle();
      page.tab = 'electorates';
      page.detail = undefined;
      page.renderPanel(false);
      const row = host.querySelector('.el-row:not(.el-row-head)');
      if (!row) throw new Error('election race list was empty');
      return take(meter, host, () => {
        host.scrollTop += 56;
        page.renderStatus();
      }, () => paintRow(row, layout.cssWidth, 56));
    } finally {
      view.dispose();
      host.remove();
      release();
    }
  },
};
