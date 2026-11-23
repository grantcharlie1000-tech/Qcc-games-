import {describe,expect,it} from 'vitest';
import {uiIcon} from '../../src/ui/icons';

// MOTION-9 (#24): the light tab bar draws every tab's filled twin, and the release must settle on exactly the rest pixels
// (tooling-4 assembly: settle == rest). The TV glyph's foot was the one stroked shape in a filled twin (a 1.75 round-capped
// line). After a drag crossed TV Shows, the frames that ease its ink left the round caps' outer anti-aliased column from an
// older frame: 3 px, 2-3/255 darker, at the foot's ends (a forced repaint clears them: stale raster, not style). The filled
// twins draw fills only: the foot is the same capsule, filled, and settle equals rest again.
describe('tab bar filled glyph twins',()=>{
  // The menu circle's three bars stay a stroke: that glyph sits outside the tabs and never eases under the lens.
  for(const name of ['games','home','film','tv','bookmark','study'] as const)it(`${name} fills, with no stroked shape`,()=>{
    const fill=uiIcon(name).match(/<g class="ui-icon-fill"[^>]*>([\s\S]*?)<\/g>/)?.[1];
    expect(fill,name).toBeTruthy();
    expect(fill,name).not.toMatch(/\bstroke="(?!none")/);
    expect(fill,name).not.toMatch(/\bfill="none"/);
  });
});
