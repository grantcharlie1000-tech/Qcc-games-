import {describe,it,expect} from 'vitest';
import {glassInk} from '../../src/ui/glass-ink';

describe('clear glass contrast',()=>{
  it('keeps pure white ink on bright and dark content',()=>{
    expect(glassInk([[255,255,255]]).color).toBe('#fff');
    expect(glassInk([[0,0,0]]).color).toBe('#fff');
  });
  it('adds a dark local shadow where plain white ink lacks contrast',()=>{
    expect(glassInk([[0,0,0],[255,255,255]],'light')).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[0,0,0],[255,255,255]],'dark')).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[255,255,255]]).halo).toBe('rgb(0 0 0 / .8)');
    expect(glassInk([[0,0,0]]).halo).toBe('transparent');
  });
  it('keeps the halo over textured art, where point samples can miss detail',()=>{
    expect(glassInk([[120,90,150]],undefined,false,true)).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[20,24,30]],undefined,false,true)).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[120,90,150]])).toEqual({color:'#fff',halo:'transparent'});
  });
  it('handles saturated bright surfaces without a white tint',()=>{
    expect(glassInk([[255,220,90],[210,240,160]])).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
  });
  it('ignores preferred dark ink even across a mixed field',()=>{
    expect(glassInk([[0,0,0],[255,255,255]],'light').color).toBe('#fff');
    expect(glassInk([[0,0,0],[255,255,255]],'dark').color).toBe('#fff');
  });
  it('keeps white ink over a uniform bright surface',()=>{
    expect(glassInk([[255,255,255]],'light').color).toBe('#fff');
  });
  it('keeps selected mid-gray tabs readable without a stroke',()=>{
    // Through the 20% dark clear fill, mid-grey 133 renders near rgb(109),
    // where white reaches 5.2:1; grey 145 renders near rgb(119), where white
    // only just reaches 4.5:1, inside the margin, so it gains the halo.
    expect(glassInk([[133,133,133]],undefined,true)).toEqual({color:'#fff',halo:'transparent'});
    expect(glassInk([[145,145,145]],undefined,true)).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
  });
  it('models the dark clear fill rather than a light veil',()=>{
    // A pale grey still needs a local dark shadow beneath fixed-white ink.
    expect(glassInk([[200,200,200]])).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    // A grey that white ink cannot clear through the fill gets the shadow.
    expect(glassInk([[150,150,150]]).halo).not.toBe('transparent');
  });
});
