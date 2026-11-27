import type { SurfaceCollector } from './types';

const modules = import.meta.glob('./surfaces/*.ts', { eager: true }) as Record<string, { collector?: SurfaceCollector }>;

/** Every shipped surface collector. One file per surface under ./surfaces. */
export function allCollectors(): SurfaceCollector[] {
  const list: SurfaceCollector[] = [];
  for (const mod of Object.values(modules)) {
    if (mod.collector && typeof mod.collector.collect === 'function') list.push(mod.collector);
  }
  list.sort((a, b) => a.id.localeCompare(b.id));
  const ids = list.map(c => c.id);
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate surface collector: ${ids.filter((id, i) => ids.indexOf(id) !== i).join(', ')}`);
  return list;
}
