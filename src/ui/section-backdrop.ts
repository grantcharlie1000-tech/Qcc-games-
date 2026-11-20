import {hasGlassFrameSource} from './glass-frame-source';

export type Crop = {x:number; y:number; width:number; height:number};
type Paint = (ctx:CanvasRenderingContext2D, crop:Crop, live?:HTMLCanvasElement) => true | false | HTMLCanvasElement;
type Layer = {box:Crop; z:number; paint:Paint};
type Picture = {image:HTMLImageElement; state:'loading'|'ready'|'failed'};

const intersects = (a:Crop,b:Crop) =>
  a.x+a.width>b.x && a.x<b.x+b.width && a.y+a.height>b.y && a.y<b.y+b.height;
const contains = (outer:Crop,inner:Crop) =>
  outer.x<=inner.x && outer.y<=inner.y && outer.x+outer.width>=inner.x+inner.width && outer.y+outer.height>=inner.y+inner.height;

function textPaint(node:Text, style:CSSStyleDeclaration):Paint|null {
  if (!node.data.trim()) return null;
  const range = document.createRange();
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const {color,textTransform} = style;
  const lines: {x:number; y:number; right:number; text:string}[] = [];
  for (const match of node.data.matchAll(/\S+\s*/g)) {
    range.setStart(node,match.index);
    range.setEnd(node,match.index+match[0].length);
    const rect = range.getBoundingClientRect();
    const y = (rect.top+rect.bottom)/2;
    const previous = lines.at(-1);
    if (previous?.y === y) {
      previous.text += match[0];
      previous.right = rect.right;
    } else {
      lines.push({x:rect.left,y,right:rect.right,text:match[0]});
    }
  }
  return ctx => {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    for (const {x,y,right,text} of lines) {
      if (right>x) ctx.fillText(textTransform==='uppercase'?text.toUpperCase():text,x,y,right-x);
    }
    return true;
  };
}

function pictureBox(image:HTMLImageElement, box:Crop, style:CSSStyleDeclaration):Crop|null {
  const {objectFit,objectPosition} = style;
  if (objectFit === 'fill') return box;
  if (objectFit !== 'cover' && objectFit !== 'contain') return null;
  const fit = objectFit === 'cover' ? Math.max : Math.min;
  const scale = fit(box.width/image.naturalWidth,box.height/image.naturalHeight);
  const width = image.naturalWidth*scale, height = image.naturalHeight*scale;
  const offsets = objectPosition.split(' ');
  if (offsets.length!==2 || offsets.some(value=>!/^[-\d.]+(%|px)$/.test(value))) return null;
  const offset = (value:string,space:number)=>parseFloat(value)*(value.endsWith('%')?space/100:1);
  return {x:box.x+offset(offsets[0],box.width-width),y:box.y+offset(offsets[1],box.height-height),width,height};
}

/** Bounded display list for the Games library and Movies browse content. */
export function createSectionBackdrop(invalidate:()=>void) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d',{alpha:false});
  if (!ctx) return null;
  const pictures = new Map<string,Picture>();
  let disposed = false;
  let snapshot: {root:HTMLElement; x:number; y:number; band:Crop; layer:Layer|null; background:string}|undefined;

  function cleanImage(image:HTMLImageElement):HTMLImageElement|null {
    const url = new URL(image.currentSrc||image.src,document.baseURI);
    if (url.origin === location.origin || url.protocol === 'data:' || image.crossOrigin !== null) return image;
    const key = url.href+' '+image.referrerPolicy;
    let picture = pictures.get(key);
    if (!picture) {
      // TMDB serves anonymous CORS on its normal URLs. Keep the visible request
      // independent so a failed CORS response cannot take its artwork away.
      const copy = new Image();
      copy.crossOrigin = 'anonymous';
      copy.referrerPolicy = image.referrerPolicy;
      copy.src = url.href;
      const loading:Picture = {image:copy,state:'loading'};
      picture = loading;
      void copy.decode().then(
        ()=>{loading.state='ready';},
        ()=>{loading.state='failed';}
      ).then(()=>{if (!disposed && pictures.get(key)===loading) invalidate();});
    }
    pictures.delete(key);
    pictures.set(key,picture);
    if (pictures.size>24) pictures.delete(pictures.keys().next().value!);
    return picture.state==='ready'?picture.image:null;
  }

  function collect(element:Element,band:Crop):Layer|null {
    if (element.matches('.section-navigation,dialog,.sr-only,[hidden]')) return null;
    const box = element.getBoundingClientRect();
    if (!intersects(box,band) || !box.width || !box.height) return null;
    const style = getComputedStyle(element);
    const opacity = Number(style.opacity);
    if (style.display==='none' || style.visibility!=='visible' || !opacity) return null;
    const z = Number(style.zIndex)||0;
    // A loaded and fully opaque poster covers its placeholder.
    if (element.matches('.ui-card-placeholder')) {
      const poster = element.parentElement?.querySelector('.ui-card-img.is-loaded');
      if (poster && Number(getComputedStyle(poster).opacity)===1) return null;
    }
    if (style.backgroundImage!=='none' || style.filter!=='none' || style.backdropFilter!=='none' ||
        style.mixBlendMode!=='normal' || style.clipPath!=='none' || style.position==='sticky' ||
        !(element instanceof HTMLElement) || element.matches('iframe,video,input,select,textarea')) {
      return {box,z,paint:()=>false};
    }
    // Convert CSS lengths once. Every frame paints those same DOM coordinates
    // with the viewport-to-texture transform set on the staging canvas.
    const radius = Math.min(parseFloat(style.borderTopLeftRadius)||0,box.width/2,box.height/2);
    const borderWidth = parseFloat(style.borderTopWidth)||0;
    const {backgroundColor,borderTopColor} = style;
    const clipped = style.overflowX!=='visible' || style.overflowY!=='visible';
    const children = Array.from(element.children,child=>collect(child,band))
      .filter((child):child is Layer=>child!==null).sort((a,b)=>a.z-b.z);
    const text = Array.from(element.childNodes,node=>node instanceof Text?textPaint(node,style):null)
      .filter((paint):paint is Paint=>paint!==null);

    let media:Paint|undefined;
    if (element instanceof HTMLImageElement) {
      media = ctx => {
        if (!element.complete || !element.naturalWidth) return false;
        const picture = cleanImage(element);
        const fitted = picture && pictureBox(picture,box,style);
        if (!picture || !fitted) return false;
        ctx.save();
        ctx.beginPath();
        ctx.rect(box.x,box.y,box.width,box.height);
        ctx.clip();
        ctx.drawImage(picture,fitted.x,fitted.y,fitted.width,fitted.height);
        ctx.restore();
        return true;
      };
    } else if (element instanceof HTMLCanvasElement) {
      media = (ctx,_crop,live) => {
        if (!hasGlassFrameSource(element)) return false;
        if (element!==live) return element;
        ctx.drawImage(element,box.x,box.y,box.width,box.height);
        return true;
      };
    }
    const order:Layer[] = children.filter(child=>child.z<0);
    for (const paint of text) order.push({box,z:0,paint});
    if (media) order.push({box,z:0,paint:media});
    order.push(...children.filter(child=>child.z>=0));
    return {box,z,paint(ctx,crop,live) {
      if (!intersects(box,crop)) return true;
      ctx.save();
      try {
        ctx.globalAlpha *= opacity;
        ctx.beginPath();
        ctx.roundRect(box.x,box.y,box.width,box.height,radius);
        ctx.fillStyle = backgroundColor;
        ctx.fill();
        if (clipped) ctx.clip();
        for (const child of order) {
          if (!intersects(child.box,crop)) continue;
          const result = child.paint(ctx,crop,live);
          if (result!==true) return result;
        }
        if (borderWidth) {
          ctx.beginPath();
          ctx.roundRect(box.x+borderWidth/2,box.y+borderWidth/2,
            Math.max(0,box.width-borderWidth),Math.max(0,box.height-borderWidth),Math.max(0,radius-borderWidth/2));
          ctx.strokeStyle = borderTopColor;
          ctx.lineWidth = borderWidth;
          ctx.stroke();
        }
        return true;
      } finally {
        ctx.restore();
      }
    }};
  }

  return {
    canvas,
    reset() {
      snapshot = undefined;
      // Reset the backing store after a refused upload, including its origin-clean flag.
      canvas.width = 1;
    },
    dispose() {
      disposed = true;
      pictures.clear();
    },
    paint(root:HTMLElement, backgroundRoot:HTMLElement, crop:Crop, density:number, live?:HTMLCanvasElement) {
      const {x:rootX,y:rootY} = root.getBoundingClientRect();
      let sceneCrop = crop;
      if (snapshot?.root === root) {
        sceneCrop = {...crop,x:crop.x+snapshot.x-rootX,y:crop.y+snapshot.y-rootY};
      }
      if (snapshot?.root !== root || !contains(snapshot.band,sceneCrop)) {
        // Cache the nearby DOM paint in viewport coordinates from one layout
        // read. Subsequent scrolls move the crop by the root's measured delta.
        const band = {x:-128,y:crop.y-128,width:innerWidth+256,height:crop.height+256};
        const background = getComputedStyle(backgroundRoot);
        if (background.backgroundImage!=='none') return false;
        snapshot = {root,x:rootX,y:rootY,band,layer:collect(root,band),background:background.backgroundColor};
        sceneCrop = crop;
      }
      const width = Math.ceil(crop.width*density), height = Math.ceil(crop.height*density);
      if (canvas.width!==width || canvas.height!==height) {
        canvas.width=width;
        canvas.height=height;
      }
      ctx.resetTransform();
      ctx.fillStyle = snapshot.background;
      ctx.fillRect(0,0,width,height);
      const sx = width/crop.width, sy = height/crop.height;
      ctx.setTransform(sx,0,0,sy,-sceneCrop.x*sx,-sceneCrop.y*sy);
      return snapshot.layer?.paint(ctx,sceneCrop,live)??false;
    },
    invalidate() {snapshot=undefined;},
  };
}
