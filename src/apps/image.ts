/** Pure size helper: keeps aspect, rounds, never upscales. */
export function fitWithin(width:number,height:number,maxEdge:number):{width:number;height:number} {
 const longest=Math.max(width,height);
 if(!(longest>0)||longest<=maxEdge)return {width,height};
 const scale=maxEdge/longest;
 return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
