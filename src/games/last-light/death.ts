/** 60ms contact hold, readable pixel poses, then a 140ms checkpoint return. */
export const DEATH_DURATION=.48,DEATH_IMPACT=.34;
export const DEATH_CAUSES=['spikes','saw','laser','steam','crusher','enemy','water','dark','fall'] as const;
export type DeathCause=typeof DEATH_CAUSES[number];
