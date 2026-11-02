import {describe,it,expect} from 'vitest';
import {glassInk} from '../../src/ui/glass-ink';

describe('clear glass contrast',()=>{
  it('uses dark ink on bright content and light ink on dark content',()=>{
    expect(glassInk([[255,255,255]]).color).toBe('#0b1015');
    expect(glassInk([[0,0,0]]).color).toBe('#fff');
  });
  it('adds a soft opposite-tone halo only where no plain ink reaches 4.5:1',()=>{
    expect(glassInk([[0,0,0],[255,255,255]],'light')).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[0,0,0],[255,255,255]],'dark')).toEqual({color:'#0b1015',halo:'rgb(255 255 255 / .75)'});
    expect(glassInk([[255,255,255]]).halo).toBe('transparent');
    expect(glassInk([[0,0,0]]).halo).toBe('transparent');
  });
  it('keeps the halo over textured art, where point samples can miss detail',()=>{
    expect(glassInk([[120,90,150]],undefined,false,true)).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[20,24,30]],undefined,false,true)).toEqual({color:'#fff',halo:'rgb(0 0 0 / .8)'});
    expect(glassInk([[120,90,150]])).toEqual({color:'#fff',halo:'transparent'});
  });
  it('handles saturated bright surfaces without a white tint',()=>{
    expect(glassInk([[255,220,90],[210,240,160]])).toEqual({color:'#0b1015',halo:'transparent'});
  });
  it('keeps the established tone when both inks span a mixed field',()=>{
    expect(glassInk([[0,0,0],[255,255,255]],'light').color).toBe('#fff');
    expect(glassInk([[0,0,0],[255,255,255]],'dark').color).toBe('#0b1015');
  });
  it('uses the content over a preferred tone on a uniform bright surface',()=>{
    expect(glassInk([[255,255,255]],'light').color).toBe('#0b1015');
  });
  it('keeps selected mid-gray tabs readable without a stroke',()=>{
    // Through the 20% dark clear fill, mid-grey renders near rgb(117): white
    // reaches 4.5:1 there, dark ink does not.
    expect(glassInk([[133,133,133]],undefined,true)).toEqual({color:'#fff',halo:'transparent'});
  });
  it('models the dark clear fill rather than a light veil',()=>{
    // Darkened by the fill, a pale grey still suits dark ink without a halo.
    expect(glassInk([[200,200,200]])).toEqual({color:'#0b1015',halo:'transparent'});
    // A grey that neither ink clears through the fill gets the halo.
    expect(glassInk([[150,150,150]]).halo).not.toBe('transparent');
  });
});
