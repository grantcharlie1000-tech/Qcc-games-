import {describe,it,expect} from 'vitest';
import {glassInk} from '../../src/ui/glass-ink';

describe('fixed white glass glyphs',()=>{
  const cases=[
    {name:'white backdrop',samples:[[255,255,255]]},
    {name:'black backdrop',samples:[[0,0,0]]},
    {name:'mid-gray backdrop',samples:[[133,133,133]]},
    {name:'busy mixed backdrop',samples:[[0,0,0],[255,255,255]]},
    {name:'saturated backdrop',samples:[[255,220,90],[210,240,160]]},
    {name:'dark route preference',samples:[[255,255,255]],preferred:'dark' as const},
    {name:'selected navigation',samples:[[145,145,145]],selection:true},
    {name:'textured canvas',samples:[[120,90,150]],textured:true}
  ];
  it.each(cases)('$name never changes the white foreground or adds a recolouring halo',fixture=>{
    expect(glassInk(fixture.samples as [number,number,number][],fixture.preferred,fixture.selection,fixture.textured)).toEqual({color:'#fff',halo:'transparent'});
  });
});
