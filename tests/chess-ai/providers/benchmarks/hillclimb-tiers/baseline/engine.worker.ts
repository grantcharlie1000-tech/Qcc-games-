import {computeMove} from './engine';
import type {ReplyMessage,SearchMessage} from './protocol';
const port=globalThis as unknown as {
  onmessage:((event:MessageEvent<SearchMessage>)=>void)|null;
  postMessage(message:ReplyMessage):void;
};
port.onmessage=({data})=>{
  if(data.type!=='search')return;
  try {port.postMessage({type:'result',id:data.id,revision:data.revision,result:computeMove(data.input,data.seed)});}
  catch(error){port.postMessage({type:'error',id:data.id,revision:data.revision,message:error instanceof Error?error.message:'Beginner search failed.'});}
};
port.postMessage({type:'ready'});
