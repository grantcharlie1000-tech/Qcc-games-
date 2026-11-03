type RGB=readonly [number,number,number];

/** Glyph colour is a fixed product requirement. No pixel reads, luminance
 * selection, route preference, scroll listener or delayed colour update. */
export function glassInk(_samples:readonly RGB[],_preferred?:'light'|'dark',_selection:boolean|'dark'=false,_textured=false,_veil=.06):{color:string;halo:string}{
  return {color:'#fff',halo:'transparent'};
}

/** Remove legacy duplicated strokes when an existing sheet is reused. */
export function syncSheetIconInk(sheet:HTMLElement):void{
  for(const outline of sheet.querySelectorAll('.glass-vector-halo'))outline.remove();
}

/** Existing owners keep their cleanup contract; CSS owns all foreground ink.
 * In particular, opening a sheet never starts canvas sampling or a timer. */
export function bindGlassInk(_bar:HTMLElement):()=>void{
  return ()=>{};
}
