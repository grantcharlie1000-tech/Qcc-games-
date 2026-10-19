import { liquidLayers, type Liquid } from './geometry';
export const COLOURS = [
  {name:'Red A',fill:'#ee003e',ink:'#630019'},
  {name:'Blue B',fill:'#007ac5',ink:'#00355e'},
  {name:'Yellow C',fill:'#ffd000',ink:'#665000'},
  {name:'Green D',fill:'#08ac00',ink:'#024800'},
  {name:'Magenta E',fill:'#ed20db',ink:'#610858'},
  {name:'Cyan F',fill:'#1cdacb',ink:'#075c58'},
  {name:'Orange G',fill:'#ff7600',ink:'#663000'},
];
export function liquidArt(bands:readonly Liquid[],angle=0):string {
  return liquidLayers(bands,angle).map((layer,i)=>{
    const points=layer.points.map(p=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`).join(' '),c=COLOURS[layer.colour];
    return `<g data-band="${layer.colour}" data-units="${bands.filter(b=>b.units>.000001)[i].units.toFixed(5)}"><polygon points="${points}" fill="${c.fill}"/><g class="ws-pattern" transform="rotate(${-angle} 40 24)"><text x="40" y="${layer.surface+19}" text-anchor="middle" fill="${c.ink}" font-size="12" font-weight="800">${String.fromCharCode(65+layer.colour)}</text><path d="M26 ${layer.surface+8}h4m20 0h4" stroke="${c.ink}" stroke-width="2"/></g></g>`;
  }).join('');
}
export const bandsFor=(values:readonly number[]):Liquid[]=>values.map(colour=>({colour,units:1}));
export function tubeArt(values:readonly number[],index:number):string {
  const clip=`ws-glass-clip-${index}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" class="ws-glass" viewBox="0 0 80 256" aria-hidden="true"><defs><clipPath id="${clip}"><path d="M19 34h42v181a21 21 0 0 1-42 0z"/></clipPath></defs><g clip-path="url(#${clip})"><g class="ws-liquid">${liquidArt(bandsFor(values))}</g><path d="M21 36h7v177q0 13 9 20-16-2-16-20z" fill="#fff" opacity=".13"/><path d="M57 36h4v179a21 21 0 0 1-21 21q18-6 17-23z" fill="#000" opacity=".08"/></g><path class="ws-outline" d="M17 16h46q7 0 7 5v3q0 3-5 7v184a25 25 0 0 1-50 0V31q-5-4-5-7v-3q0-5 7-5z" fill="none" stroke="#c6bdd4" stroke-width="2.3" stroke-linejoin="round"/><path d="M17 22h3m6 0h13" stroke="#e4deec" stroke-width="5" stroke-linecap="round" opacity=".52"/></svg>`;
}
