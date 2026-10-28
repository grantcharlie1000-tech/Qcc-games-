export type UiIcon='grid'|'film'|'tv'|'bookmark'|'star'|'search'|'menu'|'study'|'play'|'info'|'plus'|'check'|'chevron-left'|'chevron-right'|'back'|'close'|'image'|'alert'|'list';
const paths:Record<UiIcon,string>={
grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
film:'<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
tv:'<rect x="3" y="7" width="18" height="13" rx="2"/><path d="m8 3 4 4 4-4"/>',
bookmark:'<path d="M6 3h12v18l-6-4.5L6 21z"/>',
star:'<path d="M12 2.5 14.47 8.6 21.04 9.06 16 13.3 17.58 19.69 12 16.2 6.42 19.69 8 13.3 2.97 9.06 9.53 8.6z"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
study:'<path d="M12 6.5C10 5 7.5 4.5 4 5v13c3.5-.5 6 0 8 1.5 2-1.5 4.5-2 8-1.5V5c-3.5-.5-6 0-8 1.5zM12 6.5v13"/>',
play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
'chevron-left':'<path d="m14.5 6-6 6 6 6"/>',
'chevron-right':'<path d="m9.5 6 6 6-6 6"/>',
back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4.5 3 3 2-2 4.5 4.5"/>',
alert:'<path d="M12 3.5 21.5 20h-19z"/><path d="M12 10v4.5M12 17.5h.01"/>',
list:'<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
};
export const uiIcon=(name:UiIcon):string=>`<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
