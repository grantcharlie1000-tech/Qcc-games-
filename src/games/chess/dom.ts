/** Escapes text for HTML. Every name or string from the network passes through this. */
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Small inline icons (white, stroke based) used by chess controls. */
const ICONS: Record<string, string> = {
  flip: '<path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  flag: '<path d="M5 21V4m0 0h11l-2 4 2 4H5"/>',
  draw: '<path d="M5 9h14M5 15h14"/>',
  first: '<path d="M6 5v14M18 6l-7 6 7 6"/>',
  prev: '<path d="M15 6l-6 6 6 6"/>',
  next: '<path d="M9 6l6 6-6 6"/>',
  last: '<path d="M18 5v14M6 6l7 6-7 6"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/>',
  share: '<path d="M12 3v13M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 12h16M12 4v16"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.5-4.5"/>',
  chart: '<path d="M4 19h16M7 16V9m5 7V5m5 11v-4"/>',
};
export const ico = (name: string) => `<svg class="ch-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] ?? ''}</svg>`;

/** Opens a native dialog using the shared Liquid Glass sheet material. Returns a close function. */
export function sheet(host: HTMLElement, html: string, opts: { label: string; onClose?: () => void; className?: string } ): { el: HTMLDialogElement; close: () => void } {
  const el = document.createElement('dialog');
  el.className = `ui-glass-sheet ch-sheet ${opts.className ?? ''}`;
  el.setAttribute('aria-label', opts.label);
  el.innerHTML = html;
  host.append(el);
  let closed = false;
  const close = () => { if (closed) return; closed = true; if (el.open) el.close(); el.remove(); opts.onClose?.(); };
  el.addEventListener('close', close);
  el.addEventListener('click', (e) => { if (e.target === el) close(); });
  el.showModal();
  return { el, close };
}

export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  const area = document.createElement('textarea');
  area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  area.remove();
  return ok;
}

export function download(name: string, text: string, type = 'application/x-chess-pgn') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
