import {OPENING_ROUTES} from './campaign-opening';
import {MIDDLE_ROUTES} from './campaign-middle';
import {FINAL_ROUTES} from './campaign-final';
import type {CampaignRoute} from './campaign-types';

/** Forty authored journeys, in chapter order. Required actions, checkpoints
 * and encounter names refer only to the ordered main route. */
export const CAMPAIGN_ROUTES:readonly CampaignRoute[]=[...OPENING_ROUTES,...MIDDLE_ROUTES,...FINAL_ROUTES];
