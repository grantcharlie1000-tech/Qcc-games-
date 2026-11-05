/** Original straight-sided bevelled cube illustration. SVG geometry is shared by tray and board. */
import {christmas} from '../../festive/festive';
export const COLORS=['','#ffb914','#d62adf','#00c4d2','#803be3','#77d125','#fa6a0b','#2858a2'];
/** Christmas wrapping-paper colours for the same seven indices: reds, greens and golds, kept apart by value. */
export const FESTIVE_COLORS=['','#f2b632','#d8263a','#e9f1f7','#8c1c3c','#46b45f','#e0782f','#17806e'];
/** Ribbon over each festive block, chosen to contrast with its paper. */
const RIBBONS=['','#b8202f','#f6d77a','#d8263a','#f6d77a','#f6e7b0','#fff1c9','#f6d77a'];
/** Names read to screen readers under the Christmas palette; the glyph word is unchanged. */
const FESTIVE_COLOR_NAMES=['','gold sun','red diamond','snow ring','burgundy cross','holly leaf','copper stripes','pine dots'];
export const colorName=(color:number)=>(christmas()?FESTIVE_COLOR_NAMES:COLOR_NAMES)[color];
export const COLOR_NAMES=['','amber sun','pink diamond','cyan ring','violet cross','green leaf','orange stripes','blue dots'];
const marks=['','<path d="M16 10v12m-6-6h12m-10-4 8 8m0-8-8 8"/>','<path d="m16 10 6 6-6 6-6-6z"/>','<circle cx="16" cy="16" r="5"/>','<path d="m12 12 8 8m0-8-8 8"/>','<path d="M11 21c0-9 10-11 10-11 0 10-6 13-10 11Zm1-1 6-6"/>','<path d="m10 14 8-4m-8 12 12-6m-5 6 5-3"/>','<circle cx="12" cy="13" r="1.5"/><circle cx="20" cy="13" r="1.5"/><circle cx="16" cy="20" r="1.5"/>'];
export function gem(color:number,x=0,y=0):string{const xmas=christmas();return `<g transform="translate(${x} ${y})"><path d="M.5.5h31v31H.5z" fill="${(xmas?FESTIVE_COLORS:COLORS)[color]}"/>${xmas?`<path class="cb-ribbon" d="M14 .5h4v31h-4zM.5 14h31v4H.5z" fill="${RIBBONS[color]}" opacity=".85"/>`:''}<path d="m.5.5 4.3 4.3h22.4L31.5.5Z" fill="#fff" opacity=".4"/><path d="m.5.5 4.3 4.3v22.4L.5 31.5Z" fill="#fff" opacity=".2"/><path d="m31.5.5-4.3 4.3v22.4l4.3 4.3Z" fill="#000" opacity=".22"/><path d="m.5 31.5 4.3-4.3h22.4l4.3 4.3Z" fill="#000" opacity=".31"/><g class="cb-mark" fill="none" stroke="${xmas&&[2,4,7].includes(color)?'#fff8ec':'#172139'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${marks[color]}</g></g>`;}
export function blockSvg(color:number):string{return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" aria-hidden="true">${gem(color)}</svg>`;}
