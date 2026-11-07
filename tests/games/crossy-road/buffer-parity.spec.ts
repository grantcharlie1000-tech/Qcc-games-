import {test,expect} from '../../fixtures';
import {openGame} from './helpers';

test('changed Crossy Road instance buffers match their CPU data after scene updates',async({page})=>{
  const errors=await openGame(page,{viewport:{width:390,height:844}});
  const result=await page.evaluate(()=>{
    const hook=window.__crossyRoadTest!;
    const gl=document.querySelector<HTMLCanvasElement>('.hw-canvas')!.getContext('webgl2')!;
    const grass=(treeRows:number[])=>Array.from({length:24},(_,i)=>{
      const row=i-6,obstacles=Array(9).fill(null),blocked=Array(9).fill(false),variant=Array(9).fill(0);
      if(treeRows.includes(row)){obstacles[3]='tree';blocked[3]=true;variant[3]=2;}
      return {kind:'grass' as const,row,shade:((row%2+2)%2) as 0|1,obstacles,blocked,variant,edge:Array(12).fill(null)};
    });
    hook.forceLanes(grass([1,3,5]));
    const original=gl.bufferSubData.bind(gl),uploads:{offset:number;sourceOffset:number;count:number;capacity:number;mismatches:number}[]=[];
    gl.bufferSubData=((...args:Parameters<typeof gl.bufferSubData>)=>{
      original(...args);
      const [target,offset,data]=args;
      if(target!==gl.ARRAY_BUFFER||!(data instanceof Float32Array))return;
      const sourceOffset=args[3]??0,count=args[4]||data.length-sourceOffset;
      const size=gl.getBufferParameter(target,gl.BUFFER_SIZE) as number;
      if(size!==data.byteLength)return;
      const actual=new Float32Array(data.length);
      gl.getBufferSubData(target,0,actual);
      let mismatches=0;
      for(let i=0;i<data.length;i++)if(actual[i]!==data[i])mismatches++;
      uploads.push({offset,sourceOffset,count,capacity:data.length,mismatches});
    }) as typeof gl.bufferSubData;
    try{
      hook.forceLanes(grass([1,5]));
      hook.forceLanes(grass([]));
      hook.forceLanes(grass([1,3,5]));
      hook.hop('up');hook.advance(.2);
      return uploads;
    }finally{gl.bufferSubData=original;}
  });
  expect(result.length).toBeGreaterThan(0);
  expect(result.some(upload=>upload.offset>0)).toBe(true);
  expect(result.every(upload=>upload.offset===upload.sourceOffset*Float32Array.BYTES_PER_ELEMENT&&upload.count>0&&upload.sourceOffset+upload.count<=upload.capacity)).toBe(true);
  expect(result.filter(upload=>upload.mismatches>0)).toEqual([]);
  expect(errors).toEqual([]);
});
