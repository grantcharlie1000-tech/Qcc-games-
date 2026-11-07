import {expect,it,vi} from 'vitest';
import {glassInk} from '../../../src/ui/glass-ink';
import {canvasInk,syncCanvasInkSource} from '../../../src/ui/canvas-ink';

it('known-textured game canvases never create a sampling context or read pixels',()=>{
  // Canvas is a browser boundary. Any access beyond its explicit policy fails,
  // so this catches readbacks before they can stall the GPU in a real browser.
  const canvas={dataset:{glassInk:'textured'},getContext(){throw new Error('Unexpected GPU readback');}} as unknown as HTMLCanvasElement;
  let contexts=0;
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>{contexts++;return null;}})});
  try {
    expect(()=>syncCanvasInkSource(canvas)).not.toThrow();
    expect(canvasInk({} as DOMRect,canvas)).toBeNull();
    expect(contexts).toBe(0);
  } finally {syncCanvasInkSource(null);vi.unstubAllGlobals();}
});

it('texture-aware ink is identical for every sampled brightness and the no-readback fallback',()=>{
  const fallback=glassInk([[0,0,0],[255,255,255]],undefined,false,true);
  for(let c=0;c<=255;c++) for(const selected of [false,true,'dark'] as const){
    expect(glassInk([[c,c,c]],'light',selected,true)).toEqual(fallback);
    expect(glassInk([[255-c,c,128]],'dark',selected,true)).toEqual(fallback);
  }
});
