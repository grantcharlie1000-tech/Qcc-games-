import type {BeginnerSearchInput,BeginnerSearchResult} from './engine';
export interface SearchMessage {type:'search';id:number;revision:number;seed:number;input:BeginnerSearchInput}
export type ReplyMessage={type:'ready'}|{type:'result';id:number;revision:number;result:BeginnerSearchResult}|{type:'error';id:number;revision:number;message:string};
