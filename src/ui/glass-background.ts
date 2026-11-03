type RGB=readonly [number,number,number];
export interface BackgroundPaint{rgb:RGB;alpha:number}
const transparent:BackgroundPaint={rgb:[0,0,0],alpha:0};
export function colorPaint(value:string):BackgroundPaint{
  const values=value.match(/[-\d.]+/g)?.map(Number)??[0,0,0,0];
  const scale=value.startsWith('color(srgb ')?255:1;
  return {rgb:values.slice(0,3).map(v=>v*scale) as [number,number,number],alpha:values[3]??1};
}
function split(value:string){
  const parts:string[]=[];let depth=0,start=0;
  for(let i=0;i<value.length;i++){
    if(value[i]==='(')depth++;else if(value[i]===')')depth--;
    else if(value[i]===','&&!depth){parts.push(value.slice(start,i).trim());start=i+1;}
  }
  parts.push(value.slice(start).trim());return parts;
}
const length=(value:string,size:number)=>value.endsWith('%')?parseFloat(value)*size/100:parseFloat(value);
const angle=(value:string)=>parseFloat(value)*(value.endsWith('turn')?360:value.endsWith('grad')?.9:value.endsWith('rad')?180/Math.PI:1);
interface Stop{paint:BackgroundPaint;position:string|null}
interface Gradient{kind:string;head:string;stops:Stop[];repeating:boolean}
const gradients=new Map<string,Gradient|null>();
function gradient(value:string):Gradient|null{
  if(gradients.has(value))return gradients.get(value)!;
  const match=value.match(/^(repeating-)?(linear|radial|conic)-gradient\((.*)\)$/);
  let parsed:Gradient|null=null;
  if(match){
    const parts=split(match[3]),stops:Stop[]=[];let head='';
    for(const part of parts){
      const color=part.match(/^(rgba?\([^)]*\)|color\([^)]*\))(.*)$/);
      if(!color){if(!stops.length)head=part;continue;}
      const paint=colorPaint(color[1]),positions=color[2].trim().split(/\s+/).filter(Boolean);
      for(const position of positions.length?positions:[null])stops.push({paint,position});
    }
    if(stops.length)parsed={kind:match[2],head,stops,repeating:!!match[1]};
  }
  if(gradients.size>128)gradients.clear();gradients.set(value,parsed);return parsed;
}
function interpolate(a:BackgroundPaint,b:BackgroundPaint,t:number):BackgroundPaint{
  const alpha=a.alpha*(1-t)+b.alpha*t;
  return {alpha,rgb:a.rgb.map((v,c)=>alpha?(v*a.alpha*(1-t)+b.rgb[c]*b.alpha*t)/alpha:0) as [number,number,number]};
}
function along(g:Gradient,at:number,size:number):BackgroundPaint{
  const positions=g.stops.map(s=>s.position===null?null:g.kind==='conic'&&!s.position.endsWith('%')?angle(s.position):length(s.position,size));
  positions[0]??=0;positions[positions.length-1]??=size;
  let previous=0;
  for(let i=1;i<positions.length;i++)if(positions[i]!==null){
    positions[i]=Math.max(positions[i]!,positions[previous]!);
    for(let j=previous+1;j<i;j++)positions[j]=positions[previous]!+(positions[i]!-positions[previous]!)*(j-previous)/(i-previous);
    previous=i;
  }
  const first=positions[0]!,last=positions.at(-1)!;
  if(g.repeating&&last>first)at=((at-first)%(last-first)+(last-first))%(last-first)+first;
  if(at<first)return g.stops[0].paint;
  for(let i=1;i<positions.length;i++)if(at<positions[i]!){
    const span=positions[i]!-positions[i-1]!;
    return interpolate(g.stops[i-1].paint,g.stops[i].paint,span?(at-positions[i-1]!)/span:1);
  }
  return g.stops.at(-1)!.paint;
}
function point(g:Gradient,x:number,y:number,w:number,h:number):BackgroundPaint{
  if(g.kind==='linear'){
    let degrees=180;
    if(/^-?[\d.]+(?:deg|turn|rad|grad)/.test(g.head))degrees=angle(g.head);
    else if(g.head.startsWith('to ')){
      const dx=g.head.includes('right')?1:g.head.includes('left')?-1:0;
      const dy=g.head.includes('bottom')?1:g.head.includes('top')?-1:0;
      degrees=Math.atan2(dx*(dy?h:1),-dy*(dx?w:1))*180/Math.PI;
    }
    const radians=degrees*Math.PI/180,dx=Math.sin(radians),dy=-Math.cos(radians),size=Math.abs(w*dx)+Math.abs(h*dy);
    return along(g,(x-w/2)*dx+(y-h/2)*dy+size/2,size);
  }
  const location=g.head.match(/\bat\s+([^,]+)/)?.[1].trim().split(/\s+/)??['50%','50%'];
  const coordinate=(value:string|undefined,size:number)=>value==='left'||value==='top'?0:value==='right'||value==='bottom'?size:!value||value==='center'?size/2:length(value,size);
  const cx=coordinate(location[0],w),cy=coordinate(location[1],h);
  if(g.kind==='conic'){
    const from=g.head.match(/\bfrom\s+(-?[\d.]+(?:deg|turn|rad|grad))/)?.[1]??'0deg';
    return along(g,(Math.atan2(x-cx,-(y-cy))*180/Math.PI-angle(from)+360)%360,360);
  }
  const sizes=g.head.split(/\bat\b/)[0].match(/[\d.]+(?:px|%)/g);
  let rx=Math.max(cx,w-cx),ry=Math.max(cy,h-cy);
  if(sizes?.length){rx=length(sizes[0],w);ry=length(sizes[1]??sizes[0],h);}
  else if(g.head.includes('circle')){
    const corners=[Math.hypot(cx,cy),Math.hypot(w-cx,cy),Math.hypot(cx,h-cy),Math.hypot(w-cx,h-cy)];
    rx=ry=g.head.includes('closest-side')?Math.min(cx,w-cx,cy,h-cy):g.head.includes('farthest-side')?Math.max(cx,w-cx,cy,h-cy):g.head.includes('closest-corner')?Math.min(...corners):Math.max(...corners);
  }else{
    if(g.head.includes('closest-')){rx=Math.min(cx,w-cx);ry=Math.min(cy,h-cy);}
    if(!g.head.includes('-side')){rx*=Math.SQRT2;ry*=Math.SQRT2;}
  }
  return along(g,Math.hypot((x-cx)/(rx||1),(y-cy)/(ry||1))*rx,rx);
}
/** Resolve computed CSS gradients at the glyph's position. No pixel readbacks;
 * the small weighted footprint follows the shared three-pixel diffusion. */
export function backgroundPaint(style:CSSStyleDeclaration,box:DOMRect,x:number,y:number):BackgroundPaint|null{
  const layers=split(style.backgroundImage),sizes=split(style.backgroundSize),positions=split(style.backgroundPosition),repeats=split(style.backgroundRepeat);
  let result=transparent;
  for(let i=layers.length-1;i>=0;i--){
    if(layers[i]==='none')continue;
    const g=gradient(layers[i]);if(!g)return null;
    const size=(sizes[i%sizes.length]??'auto').split(/\s+/),position=(positions[i%positions.length]??'0% 0%').split(/\s+/);
    const w=size[0]==='auto'?box.width:length(size[0],box.width),h=!size[1]||size[1]==='auto'?box.height:length(size[1],box.height);
    if(!w||!h)continue;
    const origin=(value:string|undefined,space:number)=>!value?0:value.endsWith('%')?parseFloat(value)*space/100:parseFloat(value)||0;
    const left=box.x+origin(position[0],box.width-w),top=box.y+origin(position[1],box.height-h),repeat=repeats[i%repeats.length];
    let alpha=0;const rgb=[0,0,0];
    for(const [dx,wx] of [[-4,1],[0,2],[4,1]])for(const [dy,wy] of [[-4,1],[0,2],[4,1]]){
      let px=x+dx-left,py=y+dy-top;
      if(repeat==='no-repeat'&&(px<0||py<0||px>=w||py>=h))continue;
      px=(px%w+w)%w;py=(py%h+h)%h;
      const paint=point(g,px,py,w,h),weight=wx*wy/16;
      alpha+=paint.alpha*weight;for(let c=0;c<3;c++)rgb[c]+=paint.rgb[c]*paint.alpha*weight;
    }
    const layer:BackgroundPaint={alpha,rgb:rgb.map(v=>alpha?v/alpha:0) as [number,number,number]};
    const a=alpha+result.alpha*(1-alpha);
    result={alpha:a,rgb:rgb.map((v,c)=>a?(v+result.rgb[c]*result.alpha*(1-alpha))/a:0) as [number,number,number]};
  }
  return result;
}
