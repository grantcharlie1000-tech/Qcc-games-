// Shared helpers for the item sprites (art/sprites-*.ts): every sprite is 16×16 pixel art written as
// 16 strings of 16 characters, one character per pixel ('.' is transparent), coloured through a palette.
// Templates use role letters (outline, dark, mid, light, highlight...) so one silhouette can be painted in
// several materials, the way vanilla re-colours its tool tiers, armour, dyes and spawn eggs.
import {TILE} from '../data/blocks';

export const SIZE=TILE;
/** Colour as 0xRRGGBB. */
export type Colour=number;
/** Character → colour. '.' and ' ' are always transparent. */
export type Palette=Readonly<Record<string,Colour>>;
/** A sprite painter: returns fresh 16×16 RGBA pixels (row-major, top row first). */
export type Sprite=()=>Uint8ClampedArray;

/** Paints `rows` (16 strings of 16 characters) with `palette`. Throws on malformed rows or unknown characters
 *  so a typo fails the tests instead of shipping a hole. */
export function paint(rows:readonly string[],palette:Palette):Uint8ClampedArray{
  if(rows.length!==SIZE)throw new Error(`sprite has ${rows.length} rows`);
  const out=new Uint8ClampedArray(SIZE*SIZE*4);
  rows.forEach((row,y)=>{
    if(row.length!==SIZE)throw new Error(`sprite row ${y} has ${row.length} columns: "${row}"`);
    for(let x=0;x<SIZE;x++){
      const ch=row[x];if(ch==='.'||ch===' ')continue;
      const c=palette[ch];if(c===undefined)throw new Error(`no colour for "${ch}" in row ${y}: "${row}"`);
      const i=(y*SIZE+x)*4;out[i]=c>>16&255;out[i+1]=c>>8&255;out[i+2]=c&255;out[i+3]=255;
    }
  });
  return out;
}
/** Draws vanilla's 1-pixel outline: every transparent pixel that touches (4-neighbour) a character listed in
 *  `edges` becomes that character's outline character. Earlier entries win where two parts meet. Interior
 *  holes narrower than 3 pixels close up, as they do in vanilla art. */
export function outline(rows:readonly string[],edges:Readonly<Record<string,string>>):string[]{
  const order=Object.keys(edges),at=(x:number,y:number)=>x<0||y<0||y>=rows.length||x>=rows[y].length?'.':rows[y][x];
  return rows.map((row,y)=>[...row].map((ch,x)=>{
    if(ch!=='.')return ch;
    const near=[at(x,y-1),at(x-1,y),at(x+1,y),at(x,y+1)];
    for(const k of order)if(near.includes(k))return edges[k];
    return ch;
  }).join(''));
}
/** A sprite from a template and palette, outlined with `edges` when given. */
export const sprite=(rows:readonly string[],palette:Palette,edges?:Readonly<Record<string,string>>):Sprite=>{
  const final=edges?outline(rows,edges):rows;
  return()=>paint(final,palette);
};
/** Outline map giving every listed character the same outline character. */
export const edgesOf=(chars:string,to:string)=>Object.fromEntries([...chars].map(c=>[c,to]));

// ---- Colour arithmetic ---------------------------------------------------------------------------
const clamp=(v:number)=>Math.max(0,Math.min(255,Math.round(v)));
export const rgb=(r:number,g:number,b:number):Colour=>clamp(r)<<16|clamp(g)<<8|clamp(b);
export const channels=(c:Colour):[number,number,number]=>[c>>16&255,c>>8&255,c&255];
/** Multiplies a colour's channels by k (darken < 1 < brighten). */
export function scale(c:Colour,k:number):Colour{const [r,g,b]=channels(c);return rgb(r*k,g*k,b*k);}
/** Linear mix from a (t=0) to b (t=1). */
export function mix(a:Colour,b:Colour,t:number):Colour{
  const [ar,ag,ab]=channels(a),[br,bg,bb]=channels(b);return rgb(ar+(br-ar)*t,ag+(bg-ag)*t,ab+(bb-ab)*t);
}
/** A five-step ramp around a base colour, as vanilla shades a single-colour item:
 *  o outline, d dark, m the base itself, l light, h highlight. */
export function ramp(base:Colour,{outline=.42,dark=.72,light=.3,highlight=.62}:{outline?:number;dark?:number;light?:number;highlight?:number}={}){
  return{o:scale(base,outline),d:scale(base,dark),m:base,l:mix(base,0xffffff,light),h:mix(base,0xffffff,highlight)};
}
/** Renames the keys of a ramp (e.g. to O/D/M/L/H) so two ramps can share one palette. */
export function keys(r:Record<string,Colour>,map:Record<string,string>):Record<string,Colour>{
  const out:Record<string,Colour>={};for(const [k,v] of Object.entries(map))out[v]=r[k];return out;
}
