/** Exact distance from a line segment to a box, tested against a sphere radius.
 * Split where each axis crosses a face; squared distance is quadratic per span. */
export function sweepSphereBox(from:readonly number[],to:readonly number[],center:readonly number[],half:readonly number[],radius:number){
  // A disjoint swept bounding box is a cheap rejection for distant hazards.
  let lowerBound=0;
  for(let axis=0;axis<from.length;axis++){
    const lo=Math.min(from[axis],to[axis]),hi=Math.max(from[axis],to[axis]);
    const d=Math.max(0,center[axis]-half[axis]-hi,lo-center[axis]-half[axis]);lowerBound+=d*d;
  }
  if(lowerBound>radius*radius+1e-12)return false;
  const cuts=[0,1];
  for(let axis=0;axis<from.length;axis++)if(to[axis]!==from[axis])for(const sign of [-1,1]){const t=(center[axis]+sign*half[axis]-from[axis])/(to[axis]-from[axis]);if(t>0&&t<1)cuts.push(t);}
  cuts.sort((a,b)=>a-b);
  function distance(t:number){let sum=0;for(let axis=0;axis<from.length;axis++){const d=Math.max(0,Math.abs(from[axis]+(to[axis]-from[axis])*t-center[axis])-half[axis]);sum+=d*d;}return sum;}
  for(let i=0;i<cuts.length-1;i++){
    const lo=cuts[i],hi=cuts[i+1],mid=(lo+hi)/2;let aa=0,ab=0;
    for(let axis=0;axis<from.length;axis++){
      const v=to[axis]-from[axis],p=from[axis]-center[axis],m=p+v*mid;
      if(Math.abs(m)>half[axis]){const b=p-Math.sign(m)*half[axis];aa+=v*v;ab+=v*b;}
    }
    const t=aa?Math.max(lo,Math.min(hi,-ab/aa)):lo;
    if(Math.min(distance(lo),distance(hi),distance(t))<=radius*radius+1e-12)return true;
  }
  return false;
}
