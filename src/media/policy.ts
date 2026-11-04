export type Purpose='post'|'snap'|'avatar'|'banner';
export interface Policy {maxEdge:number;floorEdge:number;targetBytes:number;maxBytes:number;thumbEdge:number|null;thumbMaxBytes:number;square:boolean}
export const POLICIES:Record<Purpose,Policy>={
 post:{maxEdge:1600,floorEdge:1280,targetBytes:500*1024,maxBytes:1024*1024,thumbEdge:480,thumbMaxBytes:50*1024,square:false},
 snap:{maxEdge:1440,floorEdge:1080,targetBytes:350*1024,maxBytes:1024*1024,thumbEdge:null,thumbMaxBytes:0,square:false},
 avatar:{maxEdge:256,floorEdge:256,targetBytes:100*1024,maxBytes:150*1024,thumbEdge:96,thumbMaxBytes:20*1024,square:true},
 banner:{maxEdge:1600,floorEdge:1200,targetBytes:300*1024,maxBytes:600*1024,thumbEdge:640,thumbMaxBytes:60*1024,square:false}
};
export const QUALITY_LADDER=[82,76,70] as const;
export const MAX_UPLOAD_BYTES=4194304;
export const MAX_INPUT_SIDE=10000;
export const MAX_INPUT_PIXELS=40_000_000;
export const PENDING_TTL_MS=3600000;
export const mediaKey=(id:string,variant:'full'|'thumb'):string=>`${id}/${variant}`;
export const validMediaId=(value:unknown):value is string=>typeof value==='string'&&/^m_[a-f0-9]{32}$/.test(value);
