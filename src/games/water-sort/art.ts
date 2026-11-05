import { liquidLayers, type Liquid } from './geometry';
import { christmas } from '../../festive/festive';
export const COLOURS = [
  {name:'Red A',fill:'#ee003e',ink:'#630019'},
  {name:'Blue B',fill:'#007ac5',ink:'#00355e'},
  {name:'Yellow C',fill:'#ffd000',ink:'#665000'},
  {name:'Green D',fill:'#08ac00',ink:'#024800'},
  {name:'Magenta E',fill:'#ed20db',ink:'#610858'},
  {name:'Cyan F',fill:'#1cdacb',ink:'#075c58'},
  {name:'Orange G',fill:'#ff7600',ink:'#663000'},
];
/** Christmas liquids for the same seven indices (names, letters and rules unchanged). */
const FESTIVE_LIQUIDS = [
  {fill:'#d8203c',ink:'#5e0716'},
  {fill:'#2f7fd1',ink:'#0d2e55'},
  {fill:'#f4c534',ink:'#5e4706'},
  {fill:'#279c4f',ink:'#06381a'},
  {fill:'#a8327f',ink:'#ffe6f4'},
  {fill:'#c8eef2',ink:'#1d5560'},
  {fill:'#f07722',ink:'#5a2600'},
];
/** The fill and glyph ink currently shown for a colour index. */
export function liquidColour(index:number):{fill:string,ink:string}{return christmas()?FESTIVE_LIQUIDS[index]:COLOURS[index];}
export function liquidArt(bands:readonly Liquid[],angle=0):string {
  return liquidLayers(bands,angle).map((layer,i)=>{
    const points=layer.points.map(p=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' '),c=liquidColour(layer.colour);
    return `<g data-band="${layer.colour}" data-units="${bands.filter(b=>b.units>.000001)[i].units.toFixed(5)}"><polygon points="${points}" fill="${c.fill}"/><g class="ws-pattern" transform="rotate(${-angle} 40 24)"><text x="40" y="${layer.surface+19}" text-anchor="middle" fill="${c.ink}" font-size="12" font-weight="800">${String.fromCharCode(65+layer.colour)}</text><path d="M26 ${layer.surface+8}h4m20 0h4" stroke="${c.ink}" stroke-width="2"/></g></g>`;
  }).join('');
}
export const bandsFor=(values:readonly number[]):Liquid[]=>values.map(colour=>({colour,units:1}));
export function tubeArt(values:readonly number[],index:number):string {
  const clip=`ws-glass-clip-${index}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ws-glass" viewBox="0 0 80 256" aria-hidden="true"><defs><clipPath id="${clip}"><path d="M19 34h42v181a21 21 0 0 1-42 0z"/></clipPath></defs><g clip-path="url(#${clip})"><g class="ws-liquid">${liquidArt(bandsFor(values))}</g><path d="M21 36h7v177q0 13 9 20-16-2-16-20z" fill="#fff" opacity=".13"/><path d="M57 36h4v179a21 21 0 0 1-21 21q18-6 17-23z" fill="#000" opacity=".08"/></g><path class="ws-outline" d="M17 16h46q7 0 7 5v3q0 3-5 7v184a25 25 0 0 1-50 0V31q-5-4-5-7v-3q0-5 7-5z" fill="none" stroke="#c6bdd4" stroke-width="2.3" stroke-linejoin="round"/><path d="M17 22h3m6 0h13" stroke="#e4deec" stroke-width="5" stroke-linecap="round" opacity=".52"/>${christmas()?SNOW_RIM:''}</svg>`;
}
/** A little snow resting on the tube's lip and a holly sprig on its shoulder; decoration only, outside the glass. */
const SNOW_RIM='<g class="ws-snow" aria-hidden="true"><path d="M9 18q1-6 7-6 3-4 8-2 4-3 9 0 4-3 9 0 5-3 9 1 5-2 8 2 6 0 7 5z" fill="#f6faff" stroke="#c9d8e8" stroke-width="1.2" stroke-linejoin="round"/><path d="M63 30q11-5 15 4-9 3-15-4zm0 0q-1 11 7 14 3-9-7-14z" fill="#2c9a55" stroke="#1f6a3c" stroke-width=".8"/><circle cx="62" cy="30" r="3.2" fill="#d8263a"/><circle cx="66.5" cy="28.5" r="2.8" fill="#c41e33"/></g>';
