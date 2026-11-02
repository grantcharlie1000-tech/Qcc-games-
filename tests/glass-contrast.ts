import {expect} from '@playwright/test';
import type {Locator,Page} from '@playwright/test';
/** Hide glyph fill for a backdrop shot while keeping its text-shadow halo.
 * WebKit paints no text-shadow for fully transparent text, so use a 1% grey:
 * it leaves the halo intact and only nudges the measured backdrop toward the
 * ink (a conservative error). */
export const HIDDEN_INK='rgb(128 128 128 / .01)';
/** Adaptive glass ink (src/ui/glass-ink.ts) wraps sheet text in .glass-label
 * and resolves each glyph's colour on a later animation frame. Read glyph
 * colours only after every text glyph is inked and two reads agree, so the
 * measured colour is the one actually painted in the screenshot. */
export async function settleGlassInk(scope:Locator):Promise<void>{
  const read=()=>scope.evaluate(root=>{
    const unresolved=[...root.querySelectorAll('.glass-label')].filter(e=>e.getBoundingClientRect().width&&!e.classList.contains('glass-ink')).length;
    return JSON.stringify({unresolved,ink:[...root.querySelectorAll('.glass-ink')].map(e=>getComputedStyle(e).color)});
  });
  // Live-canvas ink is resampled every 140ms and a change must repeat once
  // before it applies, so require three equal reads spanning 400ms.
  let previous='',same=0;
  await expect.poll(async()=>{const current=await read();same=current===previous&&JSON.parse(current).unresolved===0?same+1:0;previous=current;return same>=2;},{intervals:[200]}).toBe(true);
}
export interface GlyphBox{x:number;y:number;w:number;h:number;color:string}
export interface GlyphSample{worst:number;typical:number;count:number;diagonalCount?:number}
/** Isolate foreground alpha without changing the panel's compositing path.
 * Making a translucent ancestor opaque can move Chromium's glyph raster grid
 * by a device pixel. Keep its background, stroke and shadow, varying only fill. */
export async function glyphFillMask(page:Page,panel:Locator,selector:string,svg=false):Promise<string>{
  const rule=(fill:string)=>`${selector}{-webkit-text-fill-color:${fill}!important;${svg?`color:${fill}!important`:''}}`;
  const style=await page.addStyleTag({content:rule('#fff')});
  try{
    const white=(await panel.screenshot({animations:'disabled'})).toString('base64');
    await style.evaluate((e,css)=>e.textContent=css,rule('#000'));
    const black=(await panel.screenshot({animations:'disabled'})).toString('base64');
    return await page.evaluate(async({white,black})=>{
      const image=new Image(),canvas=document.createElement('canvas');
      image.src='data:image/png;base64,'+white;await image.decode();
      canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d')!;
      ctx.drawImage(image,0,0);const light=ctx.getImageData(0,0,canvas.width,canvas.height);
      image.src='data:image/png;base64,'+black;await image.decode();ctx.drawImage(image,0,0);
      const dark=ctx.getImageData(0,0,canvas.width,canvas.height);
      for(let i=0;i<light.data.length;i+=4){
        const alpha=Math.max(...[0,1,2].map(c=>Math.abs(light.data[i+c]-dark.data[i+c])));
        light.data[i]=light.data[i+1]=light.data[i+2]=alpha;light.data[i+3]=255;
      }
      ctx.putImageData(light,0,0);return canvas.toDataURL('image/png').split(',')[1];
    },{white,black});
  }finally{await style.evaluate(e=>e.parentNode?.removeChild(e));}
}
// Locate rasterized ink cores, then compare specified ink with its backdrop.
// The relative mask peak also supports small antialiased fonts. Visible-edge
// mode instead measures the actual exterior outline with foreground retained.
// https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
export async function glyphContrast(page:Page,shot:string,mask:string,boxes:GlyphBox[],bounds:{width:number;height:number},visibleEdges=false):Promise<number[]>{
  return (await glyphContrastSamples(page,shot,mask,boxes,bounds,visibleEdges)).map(sample=>sample.worst);
}
export async function glyphContrastSamples(page:Page,shot:string,mask:string,boxes:GlyphBox[],bounds:{width:number;height:number},visibleEdges=false):Promise<GlyphSample[]>{
return page.evaluate(async({shot,mask,boxes,bounds,visibleEdges})=>{
      const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const context=c.getContext('2d')!;context.drawImage(image,0,0);
      const data=context.getImageData(0,0,c.width,c.height).data;
      // Element geometry is in CSS pixels; PNGs use device pixels (and may
      // round a fractional clip). Derive both scales from the actual images.
      const sx=c.width/bounds.width,sy=c.height/bounds.height;
      // A fractional CSS clip can round its PNG width up. That coordinate
      // scale must not turn the intended two DPR3 edge pixels into three.
      const edgeDistance=Math.max(1,Math.floor(window.devicePixelRatio*2/3));
      image.src='data:image/png;base64,'+mask;await image.decode();context.drawImage(image,0,0);
      const inkMask=context.getImageData(0,0,c.width,c.height).data;
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      return boxes.map(b=>{
        const color=b.color.match(/[\d.]+/g)!.map(Number),alpha=color[3]??1;let worst=Infinity,total=0,count=0,diagonalCount=0;
        const left=Math.max(0,Math.ceil(b.x*sx)),right=Math.min(c.width,Math.floor((b.x+b.w)*sx)),top=Math.max(0,Math.ceil(b.y*sy)),bottom=Math.min(c.height,Math.floor((b.y+b.h)*sy));
        let peak=0;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          const i=(y*c.width+x)*4;peak=Math.max(peak,Math.min(inkMask[i],inkMask[i+1],inkMask[i+2])/255);
        }
        if(!peak)return {worst:0,typical:0,count:0};
        // Thin DPR1 curves may have only diagonal exterior neighbours; their
        // axial neighbours are still antialiased foreground. Use that contour
        // only when the ordinary axial contour supplies no samples at all.
        for(const diagonal of visibleEdges?[false,true]:[false]){
        if(count)break;
        const neighbours=diagonal?[[1,1],[-1,1],[1,-1],[-1,-1]]:Array.from({length:edgeDistance},(_,i)=>{const d=i+1;return [[d,0],[-d,0],[0,d],[0,-d]];}).flat();
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          const i=(y*c.width+x)*4;
          if(visibleEdges){
            // Inspect the actual visible outline just outside opaque glyph
            // cores, not a shadow hidden beneath the foreground. At DPR3 this
            // is the nearest two device pixels (2/3 CSS px) along either axis.
            if(Math.max(inkMask[i],inkMask[i+1],inkMask[i+2])>12)continue;
            let adjacent=false;
            for(const [dx,dy] of neighbours){
              const xx=x+dx,yy=y+dy;
              if(xx<0||xx>=c.width||yy<0||yy>=c.height)continue;
              const j=(yy*c.width+xx)*4;
              if(Math.min(inkMask[j],inkMask[j+1],inkMask[j+2])>=242)adjacent=true;
            }
            if(!adjacent)continue;
          }else if(Math.min(inkMask[i],inkMask[i+1],inkMask[i+2])/255<peak*(245/255))continue;
          const backdrop=[data[i],data[i+1],data[i+2]],bg=lum(backdrop);
          const ink=lum(color.slice(0,3).map((v,c)=>v*alpha+backdrop[c]*(1-alpha)));
          const contrast=(Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05);
          worst=Math.min(worst,contrast);total+=contrast;count++;
        }
        if(diagonal)diagonalCount=count;
        }
        return {worst:Number.isFinite(worst)?worst:0,typical:count?total/count:0,count,...(diagonalCount?{diagonalCount}:{})};
      });
    },{shot,mask,boxes,bounds,visibleEdges});
}
