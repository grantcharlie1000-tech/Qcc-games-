import {describe,expect,test} from 'vitest';
import {ADVANCEMENTS} from '../../../src/games/blockcraft/ui/advancements-data';
import {TOAST_HEADINGS,TOAST_TEXT_WIDTH,TOAST_WIDTH,toastFade,toastLines,toastUnit} from '../../../src/games/blockcraft/ui/advancements-toasts';
import {hasGlyphs,textWidth} from '../../../src/games/blockcraft/ui/hud-art';

// The vanilla toast draws its heading and title in the GUI font from x = 30 of its 160 GUI px.
describe('advancement toast art',()=>{
  test('every heading and title is in the GUI font and each line fits the toast',()=>{
    expect(TOAST_TEXT_WIDTH).toBeLessThanOrEqual(TOAST_WIDTH-30-3);// clear of the 3 px frame
    for(const text of Object.values(TOAST_HEADINGS)){expect(hasGlyphs(text),text).toBe(true);expect(textWidth(text),text).toBeLessThanOrEqual(TOAST_TEXT_WIDTH);}
    for(const {title} of ADVANCEMENTS){
      expect(hasGlyphs(title),title).toBe(true);
      const lines=toastLines(title);expect(lines.join(' ')).toBe(title);
      for(const l of lines)expect(textWidth(l),l).toBeLessThanOrEqual(TOAST_TEXT_WIDTH);
    }
  });
  test('titles wider than 125 GUI px wrap at spaces like vanilla (Font.split), a word too wide inside the word',()=>{
    expect(toastLines('Taking Inventory')).toEqual(['Taking Inventory']);
    expect(textWidth('The Parrots and the Bats')).toBeGreaterThan(TOAST_TEXT_WIDTH);
    expect(toastLines('The Parrots and the Bats')).toEqual(['The Parrots and the','Bats']);
    const word='W'.repeat(30),split=toastLines(word);
    expect(split.length).toBeGreaterThan(1);expect(split.join('')).toBe(word);
    for(const l of split)expect(textWidth(l)).toBeLessThanOrEqual(TOAST_TEXT_WIDTH);
  });
  test('a wrapped title follows the heading: heading for 1.2 s, cross-fade by 1.8 s (vanilla AdvancementToast)',()=>{
    expect(toastFade(0,false)).toEqual({head:1,title:1});expect(toastFade(4000,false)).toEqual({head:1,title:1});
    expect(toastFade(0,true)).toEqual({head:1,title:0});expect(toastFade(1200,true)).toEqual({head:1,title:0});
    expect(toastFade(1350,true)).toEqual({head:.5,title:0});expect(toastFade(1650,true)).toEqual({head:0,title:.5});
    expect(toastFade(1800,true)).toEqual({head:0,title:1});expect(toastFade(6000,true)).toEqual({head:0,title:1});
  });
  test('the GUI pixel follows the HUD scale and shrinks in halves to fit narrow screens',()=>{
    expect(toastUnit(1366,3)).toBe(3);expect(toastUnit(1280,2)).toBe(2);
    expect(toastUnit(390,1.7)).toBe(1.7);expect(toastUnit(320,2)).toBe(1.5);expect(toastUnit(200,2)).toBe(1);
    expect(toastUnit(1366,NaN)).toBe(2);
  });
});
