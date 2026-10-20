import {expect,test} from 'vitest';
import {readVoxeLibreEvent} from '../../../src/games/voxelibre/bridge';

const frame={} as Window,origin='https://arcade.test';
const message=(data:unknown,source:MessageEventSource|null=frame,from=origin)=>({data,source,origin:from}) as MessageEvent;
test('accepts only declared events from this exact same-origin game frame',()=>{
  expect(readVoxeLibreEvent(message({type:'QCC_VOXELIBRE_EVENT',event:'running',persistent:true}),frame,origin)).toMatchObject({event:'running',persistent:true});
  expect(readVoxeLibreEvent(message({type:'QCC_VOXELIBRE_EVENT',event:'study'},{} as Window),frame,origin)).toBeNull();
  expect(readVoxeLibreEvent(message({type:'QCC_VOXELIBRE_EVENT',event:'study'},frame,'https://elsewhere.test'),frame,origin)).toBeNull();
  expect(readVoxeLibreEvent(message({type:'OTHER',event:'study'}),frame,origin)).toBeNull();
  expect(readVoxeLibreEvent(message({type:'QCC_VOXELIBRE_EVENT',event:'unexpected'}),frame,origin)).toBeNull();
  expect(readVoxeLibreEvent(message(null),frame,origin)).toBeNull();
});
test('rejects malformed save acknowledgements and unbounded status payloads',()=>{
  for(const fields of [{persistent:'yes'},{requestId:5},{message:{}},{message:'x'.repeat(2001)}]){
    expect(readVoxeLibreEvent(message({type:'QCC_VOXELIBRE_EVENT',event:'exited',...fields}),frame,origin)).toBeNull();
  }
});
