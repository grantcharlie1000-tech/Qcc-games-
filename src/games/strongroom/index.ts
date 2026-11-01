import type {GameModule} from '../../core/types';
import {STRONGROOM} from './meta';
import {mount} from './main.js';
import './style.css';

const game:GameModule={
  ...STRONGROOM,
  rules:'Based on Tiny Strike by Guy Zyskind (ISC). Offline tactical bomb defusal against bots on five battlegrounds. You play on the defending team: stop the attackers or hold E at the planted bomb to defuse it. Win rounds to earn money, then press B in the buy zone to purchase weapons, armour, grenades or a defuse kit. Move with W A S D, look with the mouse after clicking to capture it, fire with left click, aim or scope with right click, jump with Space, crouch with Control, reload with R, and choose weapons with 1–4 or the wheel. Hold Tab for the match scoreboard. P pauses or closes an in-game panel; Escape opens the arcade Study article. On a phone, rotate to landscape, move with the left stick, drag the right side to aim, and hold FIRE to shoot. Touch buttons handle buying, reloading, jumping, crouching, equipment and the scoreboard. Settings and appearance save on this device; matches start fresh. Online play and global rankings are unavailable in this WIP.',
  mount,
};
export default game;
