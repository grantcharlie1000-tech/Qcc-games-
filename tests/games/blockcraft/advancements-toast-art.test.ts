import {describe,expect,test} from 'vitest';
import {ADVANCEMENTS} from '../../../src/games/blockcraft/ui/advancements-data';
import {TOAST_HEADINGS,TOAST_WIDTH,toastUnit} from '../../../src/games/blockcraft/ui/advancements-toasts';
import {hasGlyphs,textWidth} from '../../../src/games/blockcraft/ui/hud-art';

// The vanilla toast draws its heading and title in the GUI font from x = 30 of its 160 GUI px.
describe('advancement toast art',()=>{
  test('every heading and title is in the GUI font and fits the toast',()=>{
    for(const text of [...Object.values(TOAST_HEADINGS),...ADVANCEMENTS.map(a=>a.title)]){
      expect(hasGlyphs(text),text).toBe(true);
      expect(textWidth(text),text).toBeLessThanOrEqual(TOAST_WIDTH-30);
    }
  });
  test('the GUI pixel follows the HUD scale and shrinks in halves to fit narrow screens',()=>{
    expect(toastUnit(1366,3)).toBe(3);expect(toastUnit(1280,2)).toBe(2);
    expect(toastUnit(390,1.7)).toBe(1.7);expect(toastUnit(320,2)).toBe(1.5);expect(toastUnit(200,2)).toBe(1);
    expect(toastUnit(1366,NaN)).toBe(2);
  });
});
