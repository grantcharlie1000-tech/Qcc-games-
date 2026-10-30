import {test,expect} from '@playwright/test';

// Where an engine draws an feImage displacement map, for three ways of applying the same SVG filter: a CSS filter chain on an HTML
// element (as the mirror lens does), a CSS filter that is only the url(), and the filter attribute on SVG content. The map's red
// channel ramps across the box and its green channel down it, so the shift measured at a point says which part of the map is there.
// The content is a grey ramp, so its brightness after the filter says where each pixel was sampled from.
test.use({viewport:{width:390,height:844},deviceScaleFactor:2});

const W=320,H=128,SCALE=32;
const VARIANTS=['none','css-chain','css-url','svg-native'] as const;
type Variant=typeof VARIANTS[number];
const X_SAMPLES=[24,64,112,160,208,256,296],Y_SAMPLES=[16,32,48,64,80,96,112];
// With the map stretched over the box, a point at x is shifted by SCALE * (x / W - 0.5), and likewise down the box.
const expected=(variant:Variant,at:number,size:number)=>variant==='none'?0:SCALE*(at/size-0.5);

async function render(page:import('@playwright/test').Page,variant:Variant,axis:'x'|'y',top:number){
  await page.setContent('<!doctype html><body style="margin:0;background:#000"></body>');
  await page.evaluate(async({variant,axis,top,W,H,SCALE})=>{
    const png=(fill:(x:number,y:number)=>[number,number,number])=>{
      const canvas=document.createElement('canvas');
      canvas.width=W*2;canvas.height=H*2;
      const context=canvas.getContext('2d')!,image=context.createImageData(W*2,H*2);
      for(let y=0;y<H*2;y++)for(let x=0;x<W*2;x++){const i=(y*W*2+x)*4,[r,g,b]=fill(x,y);image.data[i]=r;image.data[i+1]=g;image.data[i+2]=b;image.data[i+3]=255;}
      context.putImageData(image,0,0);
      return canvas.toDataURL();
    };
    const ramp=png((x,y)=>{const v=Math.round(255*(axis==='x'?(x+0.5)/(W*2):(y+0.5)/(H*2)));return [v,v,v];});
    const map=png((x,y)=>[Math.round(255*(x+0.5)/(W*2)),Math.round(255*(y+0.5)/(H*2)),128]);
    for(const src of [ramp,map]){const image=new Image();image.src=src;await image.decode();}
    const blur=variant==='css-url'?'<feGaussianBlur stdDeviation="1.5" result="frost"/>':'';
    document.body.insertAdjacentHTML('beforeend',`<svg width="0" height="0" style="position:absolute"><filter id="f" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">${blur}<feImage x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="none" href="${map}" result="map"/><feDisplacementMap in="${blur?'frost':'SourceGraphic'}" in2="map" scale="${SCALE}" xChannelSelector="R" yChannelSelector="G"/></filter></svg>`);
    const place=`position:fixed;left:35px;top:${top}px;width:${W}px;height:${H}px`;
    if(variant==='svg-native'){
      document.body.insertAdjacentHTML('beforeend',`<svg id="box" style="${place}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><g filter="url(#f)"><image width="${W}" height="${H}" preserveAspectRatio="none"/></g></svg>`);
      const image=document.querySelector('#box image')!;
      await new Promise(resolve=>{image.addEventListener('load',resolve,{once:true});image.setAttribute('href',ramp);});
    }else{
      const filter={none:'none','css-chain':'blur(1.5px) url(#f) saturate(1.9)','css-url':'url(#f)'}[variant as 'none'|'css-chain'|'css-url'];
      document.body.insertAdjacentHTML('beforeend',`<div id="box" style="${place};filter:${filter}"><img src="${ramp}" alt="" style="display:block;width:${W}px;height:${H}px"></div>`);
      await document.querySelector<HTMLImageElement>('#box img')!.decode();
    }
    for(let i=0;i<6;i++)await new Promise(resolve=>requestAnimationFrame(resolve));
  },{variant,axis,top,W,H,SCALE});
  const shot=(await page.locator('#box').screenshot()).toString('base64');
  // The shift at each sample: where the ramp's brightness says the pixel came from, less where the pixel is.
  return page.evaluate(async({shot,axis,W,H,xs,ys})=>{
    const image=new Image();
    image.src='data:image/png;base64,'+shot;
    await image.decode();
    const canvas=document.createElement('canvas');
    canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
    const context=canvas.getContext('2d')!;
    context.drawImage(image,0,0);
    const kx=canvas.width/W,ky=canvas.height/H;
    const at=(x:number,y:number)=>{const d=context.getImageData(Math.floor(x*kx),Math.floor(y*ky),1,1).data;return (d[0]+d[1]+d[2])/3;};
    return axis==='x'?xs.map(x=>at(x,H/2)/255*W-x):ys.map(y=>at(W/2,y)/255*H-y);
  },{shot,axis,W,H,xs:X_SAMPLES,ys:Y_SAMPLES});
}

for(const variant of VARIANTS)for(const top of [16,700])test(`probe: ${variant} at top ${top}`,async({page},testInfo)=>{
  const dx=await render(page,variant,'x',top),dy=await render(page,variant,'y',top);
  const round=(values:number[])=>values.map(value=>Math.round(value*10)/10);
  const report={variant,top,dpr:2,dx:round(dx),dy:round(dy),expectedDx:round(X_SAMPLES.map(x=>expected(variant,x,W))),expectedDy:round(Y_SAMPLES.map(y=>expected(variant,y,H)))};
  console.log(`lens-probe ${testInfo.project.name} ${JSON.stringify(report)}`);
  await testInfo.attach('probe.json',{body:JSON.stringify(report),contentType:'application/json'});
  dx.forEach((value,i)=>expect.soft(Math.abs(value-expected(variant,X_SAMPLES[i],W)),`${variant} dx at x=${X_SAMPLES[i]}: ${JSON.stringify(report)}`).toBeLessThan(2));
  dy.forEach((value,i)=>expect.soft(Math.abs(value-expected(variant,Y_SAMPLES[i],H)),`${variant} dy at y=${Y_SAMPLES[i]}: ${JSON.stringify(report)}`).toBeLessThan(2));
});
