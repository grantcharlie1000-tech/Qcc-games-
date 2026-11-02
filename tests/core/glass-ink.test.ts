import {describe,it,expect} from 'vitest';
import {glassInk} from '../../src/ui/glass-ink';

describe('clear glass contrast',()=>{
  it('uses dark ink on bright content and light ink on dark content',()=>{
    expect(glassInk([[255,255,255]]).color).toBe('#0b1015');
    expect(glassInk([[0,0,0]]).color).toBe('#fff');
  });
  it('does not add an outline to mixed content',()=>{
    expect(glassInk([[0,0,0],[255,255,255]]).halo).toBe('transparent');
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
    expect(glassInk([[133,133,133]],undefined,true)).toEqual({color:'#0b1015',halo:'transparent'});
  });
});
