import { relativeTime } from '../../apps/text';
import type { SocialClient } from '../../social/client';
import { PostCard } from '../../social/components/post-card';
import type { SocialContext } from '../../social/context';
import { PAGE_SIZE, type PostView } from '../../social/shared';
import { appDeps, createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'social',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const scroller = document.createElement('section');
    scroller.className = 'social-view';
    const list = document.createElement('div');
    list.className = 'social-feed';
    scroller.append(list);
    host.append(scroller);
    const ctx = {
      client: {} as SocialClient,
      deps: appDeps(),
      scroller,
      me: () => null,
      token: () => null,
      reduced: () => true,
      notify() {},
      announce() {},
      fail: () => false,
      signedOut() {},
      reloadMe: () => Promise.resolve(),
      go() {},
      refresh() {},
      openCompose() {},
      openPhotos() {},
      posted() {},
      mediaEnabled: () => false,
    } as SocialContext;
    const meter = createMeter();
    try {
      const author = { username: 'aroha', displayName: 'Aroha', avatar: null };
      const cards = Array.from({ length: PAGE_SIZE }, (_, i) => {
        const post: PostView = {
          id: `p${i + 1}`, author, body: `Feed note ${i + 1} from the common room.`, media: [],
          replyTo: null, replyToUsername: null, createdAt: new Date(Date.now() - (i + 1) * 60_000).toISOString(),
          likes: i, replies: 0, liked: false, mine: false, deleted: false, hidden: false,
        };
        const card = new PostCard(ctx, post, { variant: 'feed', position: i + 1 });
        list.append(card.el);
        return card;
      });
      const last = cards[cards.length - 1];
      const time = last.el.querySelector('time');
      if (!time) throw new Error('social time missing');
      return take(meter, host, () => {
        scroller.scrollTop += 140;
        time.textContent = relativeTime(last.post.createdAt, Date.now() + 5 * 60_000);
      }, () => paintRow(last.el, Math.min(layout.cssWidth, 640), 140));
    } finally {
      host.remove();
      release();
    }
  },
};
