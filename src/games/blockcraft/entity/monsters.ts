// Monsters: endermen (block carrying, teleporting, stare aggression; entity/monsters-enderman.ts) and slimes (splitting sizes in
// swamps and slime chunks; entity/monsters-slime.ts). Models and textures are in entity/monsters-models.ts.
import type {Game} from '../engine/contracts';
import {createEndermanKind} from './monsters-enderman';
import {createSlimeKind,splitSlime} from './monsters-slime';

/** Registers 'enderman' and 'slime' (called by engine/game.ts before init()). A dead slime splits when it leaves the world
 *  at the end of its death animation (entityRemoved), as vanilla Slime.remove; despawned or removed slimes do not. */
export function registerMonsters(game:Game):void{
  game.entities.register(createEndermanKind());
  game.entities.register(createSlimeKind());
  game.events.on('entityRemoved',p=>{const e=p?.entity;if(e&&e.kind==='slime'&&(e.deathTime>0||e.health<=0))splitSlime(game,e);});
}
