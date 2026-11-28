/** Shared library grid. The home collector and the shell render the same cards. */
export interface LibraryCard {
  id: string;
  title: string;
  color: string;
  ink: string;
  accent: string;
}

export function libraryMarkup(
  items: readonly LibraryCard[],
  filtered: boolean,
  emptyText: string,
  art: (id: string) => string,
  href: (id: string) => string,
  downloadsCover: string,
): string {
  const cards = items.map((game, index) => `<a class="game-card" data-game="${game.id}" href="${href(game.id)}" tabindex="0" aria-label="Play ${game.title}" style="--card:${game.color};--ink:${game.ink};--accent:${game.accent}"><h2>${game.title}</h2><span class="title-line"></span><img src="${art(game.id)}" alt="" width="320" height="400" fetchpriority="${game.id === 'color-blocks' || game.id === 'water-sort' ? 'high' : 'auto'}" loading="${index < 6 ? 'eager' : 'lazy'}" decoding="async" draggable="false"></a>`).join('');
  const downloads = filtered ? '' : `<a class="downloads-card" href="#/downloads" aria-label="Downloads" style="--card:#1f4c21;--ink:#fff3df;--accent:#f7c531"><h2>Downloads</h2><span class="title-line"></span><img src="${downloadsCover}" alt="" width="320" height="400" loading="lazy" decoding="async" draggable="false"></a>`;
  const filter = filtered ? '<div class="library-filter"><p class="library-filter-text"></p><button type="button" class="game-button secondary" data-action="show-all">Show all games</button></div>' : '';
  const empty = items.length ? '' : `<p class="empty-library">${emptyText}</p>`;
  return `<h1 class="sr-only">Mauri Study Notes · Games</h1>${filter}<div class="game-grid" aria-label="Game library">${cards}${downloads}</div>${empty}`;
}
