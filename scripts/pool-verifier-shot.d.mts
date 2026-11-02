import type {Page} from 'playwright';
export interface PoolGeometry {x:number;y:number;width:number;height:number;layoutKey:string;ready:boolean}
export function poolScreenPoint(box:Pick<PoolGeometry,'x'|'y'|'width'|'height'>,x:number,y:number):{x:number;y:number};
export function settledPoolGeometry(page:Page):Promise<PoolGeometry>;
export function preparePoolShot(page:Page):Promise<PoolGeometry>;
export function verifyPoolShot(page:Page):Promise<void>;
