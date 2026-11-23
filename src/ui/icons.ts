export type UiIcon='grid'|'games'|'home'|'film'|'tv'|'bookmark'|'search'|'menu'|'study'|'play'|'info'|'plus'|'check'|'chevron-left'|'chevron-right'|'back'|'close'|'image';
type NavName='games'|'home'|'film'|'tv'|'bookmark'|'study'|'menu';
const paths:Record<Exclude<UiIcon,NavName>,string>={
grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
play:'<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none"/>',
info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5.5M12 7.5h.01"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
'chevron-left':'<path d="m14.5 6-6 6 6 6"/>',
'chevron-right':'<path d="m9.5 6 6 6-6 6"/>',
back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9" r="1.5"/><path d="m5 17 4.5-4.5 3 3 2-2 4.5 4.5"/>',
};
/* Navigation set, drawn in the SF Symbols manner: one 1.75 stroke on a 24 grid,
   round caps and joins, continuous corners, and a filled twin for the selected
   tab. Fills cut their details out with even-odd, so they stay one colour and
   read as glass ink at any size. The selected tab shows the fill (theme.css). */
type NavGlyph={line:string;fill:string};
const nav:Record<NavName,NavGlyph>={
games:{
  line:'<path d="M8 6.5h8a4.6 4.6 0 0 1 4.5 3.7l.95 5a2.6 2.6 0 0 1-4.4 2.3L15.3 15.6H8.7l-1.75 1.9a2.6 2.6 0 0 1-4.4-2.3l.95-5A4.6 4.6 0 0 1 8 6.5z"/><path d="M8.25 9.6v3.3M6.6 11.25h3.3"/><circle cx="15.6" cy="10.2" r=".35" fill="currentColor"/><circle cx="17.4" cy="12.2" r=".35" fill="currentColor"/>',
  fill:'<path fill-rule="evenodd" d="M8 5.6h8a5.5 5.5 0 0 1 5.4 4.45l.95 5a3.5 3.5 0 0 1-5.95 3.1l-1.5-1.65H9.1l-1.5 1.65a3.5 3.5 0 0 1-5.95-3.1l.95-5A5.5 5.5 0 0 1 8 5.6zM7.45 9.4v1.05H6.4a.8.8 0 0 0 0 1.6h1.05v1.05a.8.8 0 0 0 1.6 0v-1.05h1.05a.8.8 0 0 0 0-1.6H9.05V9.4a.8.8 0 0 0-1.6 0zM15.6 9.05a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3zm1.8 2a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3z"/>'
},
home:{
  line:'<path d="M4 10.4 12 4l8 6.4v8.35A1.75 1.75 0 0 1 18.25 20.5H15v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5H5.75A1.75 1.75 0 0 1 4 18.75z"/>',
  fill:'<path fill-rule="evenodd" d="M11.45 3.2a.9.9 0 0 1 1.1 0l8.1 6.5a.9.9 0 0 1 .35.7v8.35a2.65 2.65 0 0 1-2.65 2.65h-3.6v-5.5a.9.9 0 0 0-.9-.9h-3.7a.9.9 0 0 0-.9.9v5.5H5.65A2.65 2.65 0 0 1 3 18.75V10.4a.9.9 0 0 1 .35-.7z"/>'
},
film:{
  line:'<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><path d="M7.5 4.5v15M16.5 4.5v15M3.5 9.5h4M3.5 14.5h4M16.5 9.5h4M16.5 14.5h4"/>',
  fill:'<path fill-rule="evenodd" d="M6.5 3.6h11a3.9 3.9 0 0 1 3.9 3.9v9a3.9 3.9 0 0 1-3.9 3.9h-11a3.9 3.9 0 0 1-3.9-3.9v-9a3.9 3.9 0 0 1 3.9-3.9zM4.6 7.2v1.6h1.8V7.2zm0 4v1.6h1.8v-1.6zm0 4v1.6h1.8v-1.6zm13-8v1.6h1.8V7.2zm0 4v1.6h1.8v-1.6zm0 4v1.6h1.8v-1.6zM8.4 6v12h7.2V6z"/>'
},
tv:{
  line:'<rect x="2.75" y="4.75" width="18.5" height="12.5" rx="2.75"/><path d="M8.5 20.25h7"/>',
  fill:'<path d="M5.5 3.85h13a3.65 3.65 0 0 1 3.65 3.65v7a3.65 3.65 0 0 1-3.65 3.65h-13A3.65 3.65 0 0 1 1.85 14.5v-7A3.65 3.65 0 0 1 5.5 3.85z"/><path d="M8.5 20.25h7" fill="none" stroke="currentColor"/>'
},
bookmark:{
  line:'<path d="M7.25 3.75h9.5A1.75 1.75 0 0 1 18.5 5.5v14.6a.6.6 0 0 1-.95.5L12 16.75 6.45 20.6a.6.6 0 0 1-.95-.5V5.5a1.75 1.75 0 0 1 1.75-1.75z"/>',
  fill:'<path d="M7.25 2.85h9.5a2.65 2.65 0 0 1 2.65 2.65v14.6a1.5 1.5 0 0 1-2.35 1.23L12 17.85l-5.05 3.48a1.5 1.5 0 0 1-2.35-1.23V5.5a2.65 2.65 0 0 1 2.65-2.65z"/>'
},
study:{
  line:'<path d="M12 6.9C10.2 5.5 7.6 4.9 3.75 5.1v13.2c3.85-.2 6.45.4 8.25 1.8 1.8-1.4 4.4-2 8.25-1.8V5.1c-3.85-.2-6.45.4-8.25 1.8zM12 6.9v13.2"/>',
  fill:'<path d="M11.15 6.35C9.3 5 6.8 4.45 3.7 4.2a.9.9 0 0 0-.95.9v13.25a.9.9 0 0 0 .9.9c3.05.05 5.4.55 7.5 1.65zM12.85 6.35C14.7 5 17.2 4.45 20.3 4.2a.9.9 0 0 1 .95.9v13.25a.9.9 0 0 1-.9.9c-3.05.05-5.4.55-7.5 1.65z"/>'
},
menu:{
  line:'<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  fill:'<path d="M4.5 7h15M4.5 12h15M4.5 17h15" fill="none" stroke="currentColor"/>'
},
};
export const uiIcon=(name:UiIcon):string=>{
  if(name in nav){const glyph=nav[name as NavName];return `<svg class="ui-icon ui-nav-icon" data-icon="${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><g class="ui-icon-line">${glyph.line}</g><g class="ui-icon-fill" fill="currentColor" stroke="none">${glyph.fill}</g></svg>`;}
  return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name as Exclude<UiIcon,NavName>]}</svg>`;
};
