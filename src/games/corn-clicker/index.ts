import type {GameModule} from '../../core/types';
import {CornClicker} from './ui';
import './style.css';

const game:GameModule={
  id:'corn-clicker',
  title:'Corn Clicker',
  cover:'game-art/corn-clicker/cover.svg',
  rules:`Click the cob to harvest kernels (Space or Enter works too).
Buy producers in the Shop; they harvest for you, even while you're away (50%, up to 8 hours).
Upgrades appear as you grow. Hover or tap one to see what it does.
Catch golden cobs (or press G) for big boosts.
Replant to trade your run for Golden Seeds and permanent bonuses.
The toolbar Restart starts a new farm after asking first.`,
  mount(container,context){return new CornClicker(container,context);},
};
export default game;
