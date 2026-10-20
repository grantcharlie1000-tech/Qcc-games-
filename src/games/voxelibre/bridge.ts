export interface VoxeLibreEvent {
  type:'QCC_VOXELIBRE_EVENT';
  event:'ready'|'running'|'status'|'study'|'exited'|'error';
  requestId?:string;
  persistent?:boolean;
  message?:string;
}
const events=new Set(['ready','running','status','study','exited','error']);

export function readVoxeLibreEvent(message:MessageEvent,frame:Window|null,origin:string):VoxeLibreEvent|null {
  if(!frame||message.source!==frame||message.origin!==origin)return null;
  const value=message.data;
  if(!value||typeof value!=='object'||value.type!=='QCC_VOXELIBRE_EVENT'||!events.has(value.event))return null;
  if(value.persistent!==undefined&&typeof value.persistent!=='boolean')return null;
  if(value.requestId!==undefined&&(typeof value.requestId!=='string'||value.requestId.length>120))return null;
  if(value.message!==undefined&&(typeof value.message!=='string'||value.message.length>2000))return null;
  return value as VoxeLibreEvent;
}
