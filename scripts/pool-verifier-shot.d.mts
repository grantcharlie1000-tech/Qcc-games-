import type {Page} from 'playwright';
export interface PoolGeometry {x:number;y:number;width:number;height:number;layoutKey:string;ready:boolean}
export function settledPoolGeometry(page:Page):Promise<PoolGeometry>;
export function preparePoolShot(page:Page):Promise<PoolGeometry>;
export function verifyPoolShot(page:Page):Promise<void>;
