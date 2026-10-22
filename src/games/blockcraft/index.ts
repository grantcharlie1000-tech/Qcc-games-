import type {GameModule} from '../../core/types';
import {mountEngine} from './engine/game';
import './style.css';

const game:GameModule=Object.freeze({
  id:'blockcraft',title:'Blockcraft',cover:'game-art/blockcraft/cover.svg',
  rules:'Explore an endless block world with biomes, caves, animals and monsters. In Survival, mine blocks (the right tool is faster and some blocks need one), craft tools, armour and blocks, cook food in a furnace, eat to keep your hunger up, and survive the night. In Creative you can fly (double-tap Space), break blocks instantly and take any item. Press Play, then move with W A S D, jump with Space, sneak with Shift and sprint by double-tapping W. The mouse looks around once captured; left click mines or attacks, right click places blocks, opens tables, furnaces, chests and doors, or eats food. E opens the inventory and crafting, Q drops the held item, 1 to 9 or the wheel pick a hotbar slot, F3 shows performance details. On a touch screen, drag to look, use the left stick to move and ▲ to jump, hold to mine and tap to place or use. Your world, inventory and progress are saved on this device. Restart asks before it replaces your world with a new one.',
  mount:mountEngine
});
export default game;
