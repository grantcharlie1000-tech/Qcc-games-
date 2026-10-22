import type {GameModule} from '../../core/types';
import {CornClicker} from './ui';
import './style.css';

const game:GameModule={
  id:'corn-clicker',
  title:'Corn Clicker',
  cover:'game-art/corn-clicker/cover.svg',
  rules:`Click or tap the big corn cob to harvest kernels (Space or Enter also works when the cob is focused).
Spend kernels in the Shop on producers, from Farmhands to the Corniverse, which harvest automatically. Choose ×1, ×10, ×100 or Max to buy in bulk; prices shown are the real totals.
Upgrades unlock as you own more producers and harvest more. Hover, focus or tap an upgrade to see exactly what it does, what it costs and why it unlocked. Later click upgrades add a share of your production to every click.
Golden cobs appear now and then: collect one (or press G) before its ring runs out for Lucky Harvest kernels, Bumper Crop (production ×7) or Kernel Storm (clicks ×777). Different effects multiply together; collecting an effect that is already running refreshes its timer instead of stacking.
Achievements fill the Butter Bonus, a permanent production boost that also unlocks cob skins.
Buy the Kitchen Garden Plot to plant corn varieties. Tap a seed then a plot, or drag a seed onto a plot. Ripe plants give bonuses while they stand and kernels when harvested. Empty plots beside two ripe plants can sprout new varieties.
Later, a Scarecrow companion, Harvest Festivals and the Cornpocalypse (mutant pests that siphon production and repay it with interest when popped) join the farm.
Replant to reset kernels, producers and ordinary upgrades for Golden Seeds: every seed ever claimed adds +4% production forever, and seeds buy permanent upgrades. Achievements, skins, discoveries and permanent upgrades are kept.
While you are away the farm earns 50% of base production for up to 8 hours (permanent upgrades extend this). The game autosaves; Options has export, import and backups. Restart in the toolbar starts a brand-new farm after confirmation.`,
  mount(container,context){return new CornClicker(container,context);},
};
export default game;
