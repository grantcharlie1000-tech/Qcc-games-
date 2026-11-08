// Plain Node HTTP entry for hosts that run a long-lived process (Render, Koyeb, a VPS) and for local checks.
// Build with `npm run build:server`, then run `node dist-server/server.mjs`. PORT defaults to 8787.
import {createServer} from 'node:http';
import {createApp} from './app';
import {poolFromEnv} from './db';
import {nodeResponseHeaders} from './response-headers';

const app=createApp({database:()=>poolFromEnv()});
const trustProxy=/^(1|true|yes)$/i.test(process.env.QCC_TRUST_PROXY??'');
const server=createServer(async(req,res)=>{
 try{
  const host=req.headers.host??'localhost';
  const url=new URL(req.url??'/',`${trustProxy&&req.headers['x-forwarded-proto']==='https'?'https':'http'}://${host}`);
  const headers=new Headers();
  for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(', '):value);
  const hasBody=!['GET','HEAD','OPTIONS'].includes(req.method??'GET');
  const chunks:Buffer[]=[];if(hasBody)for await(const chunk of req)chunks.push(chunk as Buffer);
  const request=new Request(url,{method:req.method,headers,body:hasBody?Buffer.concat(chunks):undefined});
  const forwarded=trustProxy?String(req.headers['x-forwarded-for']??'').split(',')[0].trim():'';
  const response=await app(request,forwarded||req.socket.remoteAddress||'');
  res.writeHead(response.status,nodeResponseHeaders(response));
  res.end(Buffer.from(await response.arrayBuffer()));
 }catch{res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Server error."}');}
});
server.listen(Number(process.env.PORT??8787),process.env.HOST??'0.0.0.0',()=>console.log(`QCC backend listening on ${process.env.PORT??8787}`));
