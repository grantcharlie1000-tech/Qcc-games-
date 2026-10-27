import type {Route} from '@playwright/test';
import {readFileSync} from 'node:fs';
export const relayVideo=readFileSync('tests/fixtures/movies.webm');
/** A real seekable HTTP media response, including the byte ranges browsers request. */
export function fulfillRelayVideo(route:Route,body=relayVideo,contentType='video/webm'){
 const range=route.request().headers().range,match=range?.match(/^bytes=(\d+)-(\d*)$/);
 const headers:Record<string,string>={'accept-ranges':'bytes'};
 if(!match)return route.fulfill({contentType,body,headers});
 const start=Number(match[1]),end=Math.min(match[2]?Number(match[2]):body.length-1,body.length-1);
 if(start>end||start>=body.length)return route.fulfill({status:416,headers:{'content-range':`bytes */${body.length}`},body:''});
 headers['content-range']=`bytes ${start}-${end}/${body.length}`;
 return route.fulfill({status:206,contentType,body:body.subarray(start,end+1),headers});
}
