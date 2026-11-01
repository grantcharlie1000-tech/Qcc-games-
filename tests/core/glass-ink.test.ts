import {describe,it,expect} from 'vitest';
import {glassInk} from '../../src/ui/glass-ink';

describe('clear glass contrast',()=>{
  it('changes only the ink over uniformly light and dark content',()=>{
    expect(glassInk([[255,255,255]])).toEqual({color:'#0b1015',scrim:'rgb(255 255 255 / 0)'});
    expect(glassInk([[0,0,0]])).toEqual({color:'#fff',scrim:'rgb(0 0 0 / 0)'});
  });
  it('uses a local veil only when one ink cannot span the background range',()=>{
    const result=glassInk([[0,0,0],[255,255,255]]);
    expect(result.color).toBe('#0b1015');
    const alpha=Number(result.scrim.match(/\/ ([\d.]+)/)![1]);
    expect(alpha).toBeGreaterThan(.4);expect(alpha).toBeLessThan(.55);
  });
  it('handles a saturated bright surface without desaturating its glass',()=>{
    expect(glassInk([[255,220,90],[210,240,160]]).color).toBe('#0b1015');
    expect(glassInk([[255,220,90],[210,240,160]]).scrim).toBe('rgb(255 255 255 / 0)');
  });
  it('accounts for darker mixtures between two saturated gradient stops',()=>{
    expect(glassInk([[255,0,255],[0,165,0]]).scrim).not.toBe('rgb(255 255 255 / 0)');
  });
  it('keeps a dark modal’s light ink when both choices need a local scrim',()=>{
    expect(glassInk([[0,0,0],[255,255,255]],'light').color).toBe('#fff');
    expect(glassInk([[255,255,255]],'light').scrim).toBe('rgb(255 255 255 / 0)');
  });
  it('includes a moving selected-tab highlight over a mid-gray backdrop',()=>{
    expect(glassInk([[96,96,96]],undefined,true).scrim).not.toBe('rgb(0 0 0 / 0)');
  });
});
