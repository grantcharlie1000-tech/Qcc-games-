// Monsters: endermen (block carrying, teleporting, stare aggression; entity/monsters-enderman.ts) and slimes (splitting sizes in
// swamps and slime chunks; entity/monsters-slime.ts). Models and textures are in entity/monsters-models.ts.
import type {Game} from '../engine/contracts';
import {createEndermanKind} from './monsters-enderman';
import {createSlimeKind,splitSlime} from './monsters-slime';

/** Registers 'enderman' and 'slime' (called by engine/game.ts before init()). Slimes split when they die. */
export function registerMonsters(game:Game):void{
  game.entities.register(createEndermanKind());
  game.entities.register(createSlimeKind());
  game.events.on('entityDied',({entity})=>{if(entity.kind==='slime')splitSlime(game,entity);});
}
