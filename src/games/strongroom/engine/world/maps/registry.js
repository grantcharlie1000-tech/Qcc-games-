import {CUSTOMS_HOUSE} from '../../../maps/customs-house';
import {HARBOR} from './harbor.js';
export const WORLD_MAP_DEFINITIONS=Object.freeze({'customs-house':CUSTOMS_HOUSE,harbor:HARBOR});
export const worldMapDefinition=value=>value==='harbor'?HARBOR:CUSTOMS_HOUSE;
