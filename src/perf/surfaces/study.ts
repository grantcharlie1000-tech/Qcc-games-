import { StudyView } from '../../study/view';
import { createMeter, listenScope, mountHost, paintRow, take } from '../app-frame';
import type { Layout } from '../types';

export const collector = {
  id: 'study',
  group: 'apps' as const,
  collect(layout: Layout) {
    const release = listenScope();
    const host = mountHost(layout);
    document.body.append(host);
    const view = new StudyView(() => {}, () => {});
    const meter = createMeter();
    try {
      host.append(view.root);
      if (!view.session.choose('close-reading')) throw new Error('study topic missing');
      view.showArticle('');
      const sections = [...view.root.querySelectorAll<HTMLElement>('.study-text-section')];
      const section = sections[Math.min(sections.length - 1, Math.floor(sections.length / 2) + 1)] ?? sections[0];
      if (!section) throw new Error('study section missing');
      return take(meter, view.root, () => { section.scrollIntoView({ block: 'start' }); }, () => paintRow(section, layout.cssWidth, 220));
    } finally {
      view.hide();
      view.root.remove();
      host.remove();
      release();
    }
  },
};
