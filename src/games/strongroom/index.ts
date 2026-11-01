import type {GameModule} from '../../core/types';
import {STRONGROOM} from './meta';
import {mount} from './main';
import './style.css';

const game:GameModule={
  ...STRONGROOM,
  rules:'Harbor training: eliminate the opposing team. No respawns. First team to 4 rounds wins. Keys: WASD or arrows move, mouse aim, LMB fire, RMB aim down sights, C crouch, Shift walk, Space jump, R reload, 1/2 weapons, Tab scores, P menu. Escape opens Study. Touch: move with the left stick and drag the right side to aim. Gameplay requires sight, hearing and precise input and is not screen-reader playable. Based on Tiny Strike by Guy Zyskind (ISC); Quaternius characters (CC0).',
  mount,
};
export default game;
