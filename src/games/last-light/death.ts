/** Shared timing: presentation always fits inside the existing retry delay. */
export const DEATH_DURATION=.35,DEATH_IMPACT=.22;
export const DEATH_CAUSES=['spikes','saw','laser','steam','crusher','enemy','water','dark','fall'] as const;
export type DeathCause=typeof DEATH_CAUSES[number];
