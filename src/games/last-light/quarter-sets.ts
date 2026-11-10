import type {Level,Platform,Station} from './levels';
import type {Run} from './model';
import {canvas,type C} from './quarter-kit';
import {bellTower} from './set-bell-tower';
import {canalQuay} from './set-canal';
import {roofs} from './set-roofs';
import {culvert} from './set-culvert';

/** Levels 2–8 of the Old Quarter are authored sets. Each one is a single
 * place a person could name, drawn from the same numbers the collision uses:
 * a landing is a floor of the tower, a tread of its stair, a roof of a house
 * or a hull on the canal. Nothing here decorates a rectangle after the fact. */
export interface QuarterSet {
 /** Screen space, behind everything: what is outside the place. `t` is 0 when motion is reduced. */
 sky(c:C,l:Level,w:number,h:number,cx:number,cy:number,t:number,ending:boolean):void;
 /** World space, behind every landing: the building itself. */
 back(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number,clock:number,s?:Run):void;
 /** Paints one landing into its cached tile; (0,0) is the landing's top-left. */
 deck(c:C,p:Platform,l:Level):void;
 /** Extra tile height under a landing, for joists or a hull. */
 depth?(p:Platform,l:Level):number;
 /** Whatever carries a moving landing, at its live position. */
 mover?(c:C,p:Platform,x:number,y:number,l:Level,clock:number,reduced:boolean):void;
 /** The way out. Drawn behind the courier, then again with `front` for anything that covers them. */
 exit(c:C,l:Level,s:Run,t:number,front:boolean,reduced:boolean,view:{width:number;height:number}):void;
 /** A lamp or wheel as the fixture it is in this place, at its live position. */
 station?(c:C,l:Level,s:Station,x:number,y:number,lit:boolean,t:number):void;
 /** Water that belongs to the place; replaces the generic waterline. */
 water?(c:C,l:Level,t:number,cx:number,cy:number,vw:number,vh:number):void;
}
// Built on first use: sets and the modules that ask for them import each other.
let sets:Readonly<Record<number,QuarterSet>>|undefined;
export function quarterSet(l:Level):QuarterSet|null{if(l.world!==0)return null;sets??={1:bellTower,2:canalQuay,3:roofs,4:roofs,5:culvert};return sets[l.id]??null;}
const decks=new WeakMap<Platform,HTMLCanvasElement>();
/** One small canvas per landing, painted once. The 4 px side and 8 px top
 * margins match the generic terrain tiles, so crumbling reuses it unchanged. */
export function setDeckTile(p:Platform,l:Level):HTMLCanvasElement{
 let tile=decks.get(p);if(tile)return tile;
 const set=quarterSet(l)!,{out,c}=canvas(p.w+8,p.h+8+(set.depth?.(p,l)??0));
 c.translate(4,8);set.deck(c,p,l);decks.set(p,out);return out;
}
