import type {Page} from '@playwright/test';
export interface GlyphBox{x:number;y:number;w:number;h:number;color:string}
// Compare actual ink cores with the rendered backdrop, including any local text shadow.
export async function glyphContrast(page:Page,shot:string,mask:string,boxes:GlyphBox[],bounds:{width:number;height:number}):Promise<number[]>{
return page.evaluate(async({shot,mask,boxes,bounds})=>{
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
        for(let y=Math.max(0,Math.ceil(b.y*sy));y<Math.min(c.height,Math.floor((b.y+b.h)*sy));y++)for(let x=Math.max(0,Math.ceil(b.x*sx));x<Math.min(c.width,Math.floor((b.x+b.w)*sx));x++){
          const i=(y*c.width+x)*4;
          if(Math.min(inkMask[i],inkMask[i+1],inkMask[i+2])<245)continue;
          const backdrop=[data[i],data[i+1],data[i+2]],bg=lum(backdrop);
          const ink=lum(color.slice(0,3).map((v,c)=>v*alpha+backdrop[c]*(1-alpha)));
          worst=Math.min(worst,(Math.max(ink,bg)+.05)/(Math.min(ink,bg)+.05));
        }
        return Number.isFinite(worst)?worst:0;
      });
    },{shot,mask,boxes,bounds});
}
