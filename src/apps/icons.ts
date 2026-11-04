/* QCC Social and QCC Chat icon set (docs/social-chat/DESIGN.md, section 9).
   Original glyphs drawn for QCC on the same 24 grid as src/ui/icons.ts:
   - outline icons: stroke 2, round caps and joins, currentColor;
   - navigation icons: stroke 1.75 with a filled twin for the selected tab, in
     the ui-icon-line / ui-icon-fill groups that theme.css already switches;
   - chat status glyphs: shape = kind (circle = text, diamond = photo),
     treatment = state (broken = sent, ring + check = opened, solid = new,
     ring + dot = received), person = pending request;
   - launcher tile marks on a 48 grid, tinted by currentColor.
   No brand marks: no bird, no X, no ghost, no copied product icons.
   Pure strings: nothing here touches the DOM at import time. */

export type AppNavIconName='apps'|'home'|'discover'|'search'|'activity'|'profile'|'chat'|'add-friend';
export type AppStatusIconName=
  |'status-text-sent'|'status-text-received'|'status-text-new'|'status-text-opened'
  |'status-snap-sent'|'status-snap-received'|'status-snap-new'|'status-snap-opened'
  |'status-opened'|'status-request';
export type AppOutlineIconName=
  |'social'|'settings'|'compose'|'reply'|'like'|'like-filled'|'share'|'more'|'photo'|'camera'
  |'close'|'back'|'send'|'block'|'report'|'trash'|'save'|'saved'|'timer'|'lock'|'check'|'plus'
  |'info'|'alert'|'retry'|'chevron-right';
export type AppTileIconName='social-tile'|'chat-tile';
export type AppIconName=AppNavIconName|AppStatusIconName|AppOutlineIconName|AppTileIconName;

type NavGlyph={line:string;fill:string};

/* Shared geometry. The text family is a 7-unit circle; the photo family is a
   diamond of the same visual weight (8.25 to each vertex). */
const ring='<circle cx="12" cy="12" r="7"/>';
const diamond='M12 3.75 20.25 12 12 20.25 3.75 12z';
const centreDot='<circle cx="12" cy="12" r="2.5" fill="currentColor" stroke="none"/>';
const tick='<path d="m8.75 12.25 2.25 2.25 4.25-4.5"/>';
/* Chat mark: a capsule with a short tail, and two dots that trail off to the
   right as the message fades. */
const bubble='M7.5 4.75h3a5.25 5.25 0 0 1 0 10.5H8.5l-3.6 3.2V14.6A5.25 5.25 0 0 1 7.5 4.75z';
const trail='<circle cx="18.9" cy="10" r="1.4" fill="currentColor" stroke="none"/><circle cx="21.9" cy="10" r=".9" fill="currentColor" stroke="none"/>';
/* Social mark: an orbit. A centre dot, an open ring and one satellite in the
   ring's gap at the upper right: you, and the people around you. */
const orbit='<path d="M19.73 9.93A8 8 0 1 1 14.07 4.27"/><circle cx="17.66" cy="6.34" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2.75" fill="currentColor" stroke="none"/>';
const heart='M12 19.5s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 6.9a4.25 4.25 0 0 1 7.5 2.6c0 5.4-7.5 10-7.5 10z';
const pin='M9 3.5h6l-1 5 3.5 3.5v1.5h-11V12L10 8.5z';

const nav:Record<AppNavIconName,NavGlyph>={
apps:{
  line:'<circle cx="7" cy="7" r="3.25"/><circle cx="17" cy="7" r="3.25"/><circle cx="7" cy="17" r="3.25"/><circle cx="17" cy="17" r="3.25"/>',
  fill:'<circle cx="7" cy="7" r="4.1"/><circle cx="17" cy="7" r="4.1"/><circle cx="7" cy="17" r="4.1"/><circle cx="17" cy="17" r="4.1"/>'
},
home:{
  line:'<path d="M4.5 10.5 12 4.5l7.5 6v8a2 2 0 0 1-2 2h-3.25v-5.25a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75v5.25H6.5a2 2 0 0 1-2-2z"/>',
  fill:'<path fill-rule="evenodd" d="M11.44 3.7a.9.9 0 0 1 1.12 0l7.5 6a.9.9 0 0 1 .34.7v8.1a2.9 2.9 0 0 1-2.9 2.9h-3.5a.5.5 0 0 1-.5-.5V15.5h-3v5.4a.5.5 0 0 1-.5.5H6.5a2.9 2.9 0 0 1-2.9-2.9v-8.1a.9.9 0 0 1 .34-.7z"/>'
},
discover:{
  line:'<circle cx="12" cy="12" r="8.5"/><path d="m15 9-1.75 4.25L9 15l1.75-4.25z"/>',
  fill:'<path fill-rule="evenodd" d="M12 2.6a9.4 9.4 0 1 1 0 18.8 9.4 9.4 0 0 1 0-18.8zm3 6.4-4.25 1.75L9 15l4.25-1.75z"/>'
},
search:{
  line:'<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  fill:'<circle cx="11" cy="11" r="7.4"/><path d="m16 16 4 4" fill="none" stroke="currentColor" stroke-width="2.6"/>'
},
activity:{
  line:'<path d="M3 12h3.75l2.5-6.5 5.5 13 2.5-6.5H21"/>',
  fill:'<path d="M3 12h3.75l2.5-6.5 5.5 13 2.5-6.5H21" fill="none" stroke="currentColor" stroke-width="2.6"/>'
},
profile:{
  line:'<circle cx="12" cy="8.5" r="3.75"/><path d="M4.75 20a7.25 7.25 0 0 1 14.5 0"/>',
  fill:'<circle cx="12" cy="8.5" r="4.6"/><path d="M3.9 20a8.1 8.1 0 0 1 16.2 0 .9.9 0 0 1-.9.9H4.8a.9.9 0 0 1-.9-.9z"/>'
},
chat:{
  line:`<path d="${bubble}"/>${trail}`,
  fill:`<path d="${bubble}" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><circle cx="18.9" cy="10" r="1.6"/><circle cx="21.9" cy="10" r="1.05"/>`
},
'add-friend':{
  line:'<circle cx="10" cy="8.5" r="3.5"/><path d="M3.5 19.75a6.5 6.5 0 0 1 13 0M19 5.5v5M16.5 8h5"/>',
  fill:'<circle cx="10" cy="8.5" r="4.35"/><path d="M2.6 19.75a7.4 7.4 0 0 1 14.8 0 .9.9 0 0 1-.9.9H3.5a.9.9 0 0 1-.9-.9z"/><path d="M19 5.5v5M16.5 8h5" fill="none" stroke="currentColor" stroke-width="2.2"/>'
},
};

const outline:Record<AppOutlineIconName|AppStatusIconName,string>={
social:orbit,
settings:'<path d="M4 7h9M18 7h2M4 17h2M11 17h9"/><circle cx="15.5" cy="7" r="2.5"/><circle cx="8.5" cy="17" r="2.5"/>',
compose:'<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
reply:'<path d="M9.5 7.5 4.5 12l5 4.5"/><path d="M5 12h8.5a6 6 0 0 1 6 6v1"/>',
like:`<path d="${heart}"/>`,
'like-filled':`<path d="${heart}" fill="currentColor"/>`,
share:'<circle cx="17.5" cy="5.5" r="2.5"/><circle cx="6.5" cy="12" r="2.5"/><circle cx="17.5" cy="18.5" r="2.5"/><path d="m8.7 10.7 6.6-3.9M8.7 13.3l6.6 3.9"/>',
more:'<circle cx="5.5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="18.5" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
photo:'<rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="10" r="1.75"/><path d="m4 17.5 5-4.5 3.5 3 2.5-2 5 4"/>',
camera:'<path d="M8.5 6.5 10 4.5h4l1.5 2H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8.5a2 2 0 0 1 2-2z"/><circle cx="12" cy="12.75" r="3.5"/>',
close:'<path d="M6 6l12 12M18 6 6 18"/>',
back:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
send:'<path d="M20.5 3.5 10 14"/><path d="M20.5 3.5 14 20.5l-4-6.5-6.5-4z"/>',
block:'<circle cx="12" cy="12" r="8.5"/><path d="M6 18 18 6"/>',
report:'<path d="M5.5 21V4M5.5 4.5H17l-2.25 4L17 12.5H5.5"/>',
trash:'<path d="M4.5 6.5h15M9.5 6.5v-2h5v2M6.5 6.5l1 13h9l1-13M10 10.5V16M14 10.5V16"/>',
save:`<path d="${pin}"/><path d="M12 13.5v7"/>`,
saved:`<path d="${pin}" fill="currentColor"/><path d="M12 13.5v7"/>`,
timer:'<circle cx="12" cy="13.5" r="7"/><path d="M12 13.5V10M10 3h4M18.5 6.5l1.25-1.25"/>',
lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2"/>',
check:'<path d="m5 12.5 4.5 4.5L19 7.5"/>',
plus:'<path d="M12 5v14M5 12h14"/>',
info:'<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.5h.01"/>',
alert:'<path d="M10.3 4.6a2 2 0 0 1 3.4 0l7.1 12.4a2 2 0 0 1-1.7 3H4.9a2 2 0 0 1-1.7-3z"/><path d="M12 9.5v4M12 16.75h.01"/>',
retry:'<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
'chevron-right':'<path d="m9.5 6 6 6-6 6"/>',
/* Chat status glyphs. Broken outlines leave four gaps: at the diagonals of the
   circle and at the corners of the diamond (round caps eat 1 unit each side). */
'status-text-sent':'<circle cx="12" cy="12" r="7" stroke-dasharray="6 4.996" stroke-dashoffset="3"/>',
'status-text-received':ring+centreDot,
'status-text-new':'<circle cx="12" cy="12" r="7.5" fill="currentColor"/>',
'status-text-opened':ring+tick,
'status-opened':ring+tick,
'status-snap-sent':`<path d="${diamond}" stroke-dasharray="6.67 5" stroke-dashoffset="9.17"/>`,
'status-snap-received':`<path d="${diamond}"/>${centreDot}`,
'status-snap-new':`<path d="M12 3.1 20.9 12 12 20.9 3.1 12z" fill="currentColor"/>`,
'status-snap-opened':`<path d="${diamond}"/>${tick}`,
'status-request':'<circle cx="10" cy="8.5" r="3.25"/><path d="M4 19.5a6 6 0 0 1 12 0"/><path d="M19 7v5M16.5 9.5h5"/>',
};

/* Launcher tile marks, 48 grid: a rounded tile filled with a currentColor
   gradient, a soft top sheen, and the app mark knocked out in dark ink.
   Each call gets its own gradient id, so two tiles on a page never share one. */
const TILE_INK='#0b0a12';
let tileSeq=0;
const tile=(mark:string)=>{
  const id=`qcc-tile-${++tileSeq}`;
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="currentColor"/><stop offset="1" stop-color="currentColor" stop-opacity=".74"/></linearGradient></defs><rect width="48" height="48" rx="13" fill="url(#${id})"/><path d="M13 1h22a12 12 0 0 1 12 12v5C34 13 14 13 1 18v-5A12 12 0 0 1 13 1z" fill="#fff" opacity=".16"/><rect x=".5" y=".5" width="47" height="47" rx="12.5" fill="none" stroke="#fff" stroke-opacity=".28"/><g transform="translate(6 6) scale(1.5)" fill="none" stroke="${TILE_INK}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" color="${TILE_INK}">${mark}</g>`;
};
const tiles:Record<AppTileIconName,()=>string>={
'social-tile':()=>tile(orbit),
'chat-tile':()=>tile(`<path d="${bubble}"/>${trail}`),
};

export const APP_ICON_NAMES=[...Object.keys(nav),...Object.keys(outline),...Object.keys(tiles)] as AppIconName[];

const escapeText=(value:string)=>value.replace(/[&<>"']/g,c=>`&#${c.charCodeAt(0)};`);
const a11y=(label?:string)=>label
  ?{attrs:`role="img" aria-label="${escapeText(label)}"`,title:`<title>${escapeText(label)}</title>`}
  :{attrs:'aria-hidden="true"',title:''};

/** Inline SVG for a QCC Social or Chat icon. Decorative (aria-hidden) unless a
 *  label is given; then it is role="img" with that name and a <title>. */
export function appIcon(name:AppIconName,label?:string):string{
  const {attrs,title}=a11y(label);
  const base=`xmlns="http://www.w3.org/2000/svg" data-icon="${name}" ${attrs} focusable="false"`;
  if(name in tiles)return `<svg class="app-tile-mark" ${base} viewBox="0 0 48 48">${title}${tiles[name as AppTileIconName]()}</svg>`;
  if(name in nav){const glyph=nav[name as AppNavIconName];return `<svg class="ui-icon ui-nav-icon app-icon" ${base} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">${title}<g class="ui-icon-line">${glyph.line}</g><g class="ui-icon-fill" fill="currentColor" stroke="none">${glyph.fill}</g></svg>`;}
  const status=name.startsWith('status-')?' app-status-icon':'';
  return `<svg class="ui-icon app-icon${status}" ${base} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${title}${outline[name as AppOutlineIconName|AppStatusIconName]}</svg>`;
}
