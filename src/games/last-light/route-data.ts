import {FEATURE_ROUTES,ENCOUNTER_ADDITIONS} from './feature-routes';
import {OPENING_ROUTES} from './campaign-opening';
import {MIDDLE_ROUTES} from './campaign-middle';
import {FINAL_ROUTES} from './campaign-final';
import type {CampaignRoute} from './campaign-types';

/** Forty authored journeys, in chapter order. Required actions, checkpoints
 * and encounter names refer only to the ordered main route. */
export const CAMPAIGN_ROUTES:readonly CampaignRoute[]=[...OPENING_ROUTES,...MIDDLE_ROUTES,...FINAL_ROUTES].map((original,id)=>{
 const route=FEATURE_ROUTES[id]??original,extra=ENCOUNTER_ADDITIONS[id];
 return extra?{...route,enemies:extra.enemies??route.enemies,hazards:[...route.hazards,...extra.presses??[]]}:route;
});
