// Reproducible original-score export. Requires the Vite dev server, Chromium and ffmpeg.
import {chromium} from '@playwright/test';
import {writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
export async function renderScore({modulePath,outputDir,filename}){
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.goto(process.env.ARCADE_URL||'http://127.0.0.1:4600/');
 const {base64,stats}=await page.evaluate(async(modulePath)=>{
  const {renderTheme,SCORE}=await import(modulePath),buffer=await renderTheme();
  const samples=buffer.length,channels=buffer.numberOfChannels,bytes=new ArrayBuffer(44+samples*channels*2),view=new DataView(bytes),ascii=(at,text)=>{for(let i=0;i<text.length;i++)view.setUint8(at+i,text.charCodeAt(i));};
  ascii(0,'RIFF');view.setUint32(4,bytes.byteLength-8,true);ascii(8,'WAVE');ascii(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,channels,true);view.setUint32(24,buffer.sampleRate,true);view.setUint32(28,buffer.sampleRate*channels*2,true);view.setUint16(32,channels*2,true);view.setUint16(34,16,true);ascii(36,'data');view.setUint32(40,samples*channels*2,true);
  let peak=0,power=0,offset=44,seam=0,seamSlopeError=0;for(let ch=0;ch<channels;ch++){const x=buffer.getChannelData(ch),step=x[0]-x[samples-1];seam=Math.max(seam,Math.abs(step));seamSlopeError=Math.max(seamSlopeError,Math.abs(step-((x[1]-x[0])+(x[samples-1]-x[samples-2]))/2));}
  for(let i=0;i<samples;i++)for(let ch=0;ch<channels;ch++){const value=buffer.getChannelData(ch)[i];peak=Math.max(peak,Math.abs(value));power+=value*value;view.setInt16(offset,Math.max(-32768,Math.min(32767,Math.round(value*32767))),true);offset+=2;}
  const a=new Uint8Array(bytes);let binary='';for(let i=0;i<a.length;i+=8192)binary+=String.fromCharCode(...a.subarray(i,i+8192));
  return {base64:btoa(binary),stats:{...SCORE,seconds:buffer.duration,sampleRate:buffer.sampleRate,peak,rms:Math.sqrt(power/(samples*channels)),seamDelta:seam,seamSlopeError}};
 },modulePath);
 const dir=outputDir;await mkdir(dir,{recursive:true});await writeFile(`/tmp/${filename}.wav`,Buffer.from(base64,'base64'));
 execFileSync('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',`/tmp/${filename}.wav`,'-c:a','libmp3lame','-q:a','3','-metadata',`title=${stats.title}`,'-metadata','artist=QCC Games','-metadata','comment=Original composition for QCC Games',`${dir}/${filename}.mp3`]);
 await writeFile(`${dir}/score.json`,JSON.stringify(stats,null,2)+'\n');console.log(JSON.stringify(stats));
}finally{await browser.close();}

}
