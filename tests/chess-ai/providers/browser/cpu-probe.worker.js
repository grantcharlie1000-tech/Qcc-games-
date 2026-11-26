// Fixed successful work. Identity tracing and warmup happen before retained work.
function arithmetic(iterations) {
  let checksum=123;
  const started=performance.now();
  for(let i=0;i<iterations;i++)checksum=Math.imul(checksum^i,1664525)+1013904223|0;
  return {ms:performance.now()-started,checksum,iterations};
}
onmessage=({data})=>{
  try {
    if(data?.type==='identity') {
      if(typeof data.marker!=='string'||!/^qcc-chess-capacity-[a-z0-9-]+$/.test(data.marker))throw Error('Invalid Worker identity marker');
      console.timeStamp(data.marker);
      postMessage({type:'identity',marker:data.marker});return;
    }
    const iterations=data?.iterations??50000000;
    if(!Number.isInteger(iterations)||iterations<1||iterations>1000000000)throw Error('Invalid arithmetic iteration count');
    if(data?.type==='batch') {
      const repetitions=data.repetitions;
      if(!Number.isInteger(repetitions)||repetitions<1||repetitions>20)throw Error('Invalid arithmetic repetition count');
      const started=performance.now(),samples=[];
      for(let repeat=0;repeat<repetitions;repeat++)samples.push(arithmetic(iterations));
      postMessage({type:'batch',samples,summedLoopWallMs:samples.reduce((sum,row)=>sum+row.ms,0),batchWallMs:performance.now()-started,totalIterations:iterations*repetitions});
      return;
    }
    // Keep the old single-loop wall-ratio probe API. It does not establish the
    // new capacity condition, and previously rejected wall ratios stay rejected.
    postMessage(arithmetic(iterations));
  }catch(error){postMessage({type:'error',message:String(error)});}
};
