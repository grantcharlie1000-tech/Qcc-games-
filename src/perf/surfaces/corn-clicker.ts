import game from '../../games/corn-clicker';
import { collectMounted, stubContext } from '../mount-frame';
import type { Layout } from '../types';

let spritesReady = false;

/** Sprite sheets are baked once into data URLs. That bake is not a steady frame. */
function warmSprites(): void {
  if (spritesReady) return;
  spritesReady = true;
  const host = document.createElement('div');
  document.body.append(host);
  const mounted = game.mount(host, stubContext('corn-clicker'));
  if (mounted instanceof Promise) throw new Error('corn-clicker mount is async');
  mounted.dispose();
  host.remove();
}

export const collector = {
  id: 'corn-clicker',
  group: '2d-dom' as const,
  collect(layout: Layout) {
    warmSprites();
    return collectMounted(game, layout);
  },
};
