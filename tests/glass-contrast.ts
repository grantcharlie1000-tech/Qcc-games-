import type {Page} from '@playwright/test';
export interface GlyphBox{x:number;y:number;w:number;h:number;color:string}
// Locate rasterized ink cores, then compare specified ink with its backdrop.
// The relative mask peak also supports small antialiased fonts. Visible-edge
// mode instead measures the actual exterior outline with foreground retained.
// https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum
export async function glyphContrast(page:Page,shot:string,mask:string,boxes:GlyphBox[],bounds:{width:number;height:number},visibleEdges=false):Promise<number[]>{
return page.evaluate(async({shot,mask,boxes,bounds,visibleEdges})=>{
      const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
      const c=document.createElement('canvas');c.width=image.width;c.height=image.height;
      const context=c.getContext('2d')!;context.drawImage(image,0,0);
      const data=context.getImageData(0,0,c.width,c.height).data;
      // Element geometry is in CSS pixels; PNGs use device pixels (and may
      // round a fractional clip). Derive both scales from the actual images.
      const sx=c.width/bounds.width,sy=c.height/bounds.height;
      image.src='data:image/png;base64,'+mask;await image.decode();context.drawImage(image,0,0);
      const inkMask=context.getImageData(0,0,c.width,c.height).data;
      const lum=(rgb:number[])=>rgb.reduce((l,v,i)=>{const s=v/255;return l+(s<=.04045?s/12.92:((s+.055)/1.055)**2.4)*[.2126,.7152,.0722][i];},0);
      return boxes.map(b=>{
        const color=b.color.match(/[\d.]+/g)!.map(Number),alpha=color[3]??1;let worst=Infinity;
        const left=Math.max(0,Math.ceil(b.x*sx)),right=Math.min(c.width,Math.floor((b.x+b.w)*sx)),top=Math.max(0,Math.ceil(b.y*sy)),bottom=Math.min(c.height,Math.floor((b.y+b.h)*sy));
        let peak=0;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          const i=(y*c.width+x)*4;peak=Math.max(peak,Math.min(inkMask[i],inkMask[i+1],inkMask[i+2])/255);
        }
        if(!peak)return 0;
        for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){
          const i=(y*c.width+x)*4;
          if(visibleEdges){
            // Inspect the actual visible outline just outside opaque glyph
            // cores, not a shadow hidden beneath the foreground. At DPR3 this
            // is the nearest two device pixels (2/3 CSS px) along either axis.
            if(Math.max(inkMask[i],inkMask[i+1],inkMask[i+2])>12)continue;
            let adjacent=false;
            for(let distance=1;distance<=Math.ceil(sx*2/3);distance++)for(const [dx,dy] of [[distance,0],[-distance,0],[0,distance],[0,-distance]]){
              const xx=x+dx,yy=y+dy;
              if(xx<0||xx>=c.width||yy<0||yy>=c.height)continue;
              const j=(yy*c.width+xx)*4;
              if(Math.min(inkMask[j],inkMask[j+1],inkMask[j+2])>=242)adjacent=true;
            }
            if(!adjacent)continue;
          }else if(Math.min(inkMask[i],inkMask[i+1],inkMask[i+2])/255<peak*(245/255))continue;
          const backdrop=[data[i],data[i+1],data[i+2]],bg=lum(backdrop);
          const ink=lum(color.slice(0,3).map((v,c)=>v*alpha+backdrop[c]*(1-alpha)));
          worst=Math.min(worst,(Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
        }
        return Number.isFinite(worst)?worst:0;
      });
    },{shot,mask,boxes,bounds,visibleEdges});
}
