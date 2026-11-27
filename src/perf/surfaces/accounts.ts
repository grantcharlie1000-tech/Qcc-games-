import { AccountsView } from '../../accounts/view';
import { createMeter, listenScope, memoryAccounts, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface Mode { mode(signup: boolean): void }

export const collector = {
  id: 'accounts',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const view = new AccountsView(memoryAccounts(), () => {}, () => {});
    const meter = createMeter();
    try {
      const changed = ['.account-confirm', '.account-warning', '.account-submit', '.account-login', '.account-signup']
        .map(sel => view.root.querySelector(sel)).filter((el): el is Element => !!el);
      return take(meter, view.root, () => { (view as unknown as Mode).mode(true); }, () => {
        let fill = 0;
        for (const el of changed) fill += paintRow(el, Math.min(layout.cssWidth, 420), 40);
        return fill;
      });
    } finally {
      view.root.remove();
      release();
    }
  },
};
