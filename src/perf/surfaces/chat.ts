import type { ChatClient } from '../../chat/client';
import { ConversationScreen } from '../../chat/components/conversation';
import type { ChatContext } from '../../chat/components/context';
import type { ConversationView, MessageView } from '../../chat/shared';
import { appDeps, createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

interface LogRender { render(messages: MessageView[], unread: number): void }

const ROW = 76;

export const collector = {
  id: 'chat',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    const kept = Math.min(24, Math.max(8, Math.ceil(layout.cssHeight / ROW) + 1));
    const ctx: ChatContext = {
      client: { messages: () => new Promise<ConversationView>(() => {}) } as unknown as ChatClient,
      deps: appDeps(),
      token: () => null,
      reduced: () => true,
      mediaEnabled: () => false,
      onMediaChange: () => () => {},
      wide: () => layout.cssWidth >= 960,
      notify() {},
      announce() {},
      fail: () => false,
      signedOut() {},
      go() {},
      refreshList() {},
      unreadFor: () => 0,
    };
    const screen = new ConversationScreen(ctx, host, 'friend');
    const meter = createMeter();
    try {
      const log = host.querySelector<HTMLElement>('.chat-log');
      if (!log) throw new Error('chat log missing');
      log.replaceChildren();
      const messages: MessageView[] = Array.from({ length: kept }, (_, i) => ({
        id: String(i + 1),
        kind: 'text',
        mine: i % 2 === 0,
        body: `Kia ora, message ${i + 1}`,
        snap: null,
        createdAt: new Date(Date.UTC(2026, 10, 27, 8, i)).toISOString(),
        viewedAt: null,
        saved: false,
      }));
      (screen as unknown as LogRender).render(messages, 0);
      const entry = log.querySelector('.chat-entry:last-of-type');
      if (!entry) throw new Error('chat window was empty');
      return take(meter, host, () => {
        log.scrollTop += ROW;
        log.dispatchEvent(new Event('scroll'));
      }, () => paintRow(entry, layout.cssWidth, ROW));
    } finally {
      screen.dispose();
      release();
    }
  },
};
