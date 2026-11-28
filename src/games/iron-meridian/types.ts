export type NationId = 0 | 1 | 2 | 3 | 4 | 5;
export type Equipment = 'rifles' | 'artillery' | 'tanks' | 'aircraft' | 'ships';
export type Terrain = 'plains' | 'forest' | 'hills' | 'mountain' | 'city';
export type UnitType = 'infantry' | 'motorized' | 'armored';
export type Building = 'civilian' | 'military' | 'dockyard' | 'infrastructure' | 'fort';
export type AirMission = 'reserve' | 'superiority' | 'support';
export type NavalMission = 'reserve' | 'patrol' | 'raiding';
export interface NationDefinition { id: NationId; name: string; short: string; adjective: string; color: string; dark: string; motto: string; specialty: string }
export interface ProvinceDefinition {
  id: number; name: string; x: number; y: number; polygon: [number, number][]; neighbors: number[];
  home: NationId; terrain: Terrain; capital: boolean; port: boolean; vp: number; steel: number; oil: number;
  civilian: number; military: number; dockyard: number;
}
export interface ProvinceState { owner: NationId; fort: number; infrastructure: number; civilian: number; military: number; dockyard: number }
export interface ResearchJob { tech: string; progress: number }
export interface BuildJob { province: number; kind: Building; progress: number }
export interface RecruitJob { type: UnitType; progress: number }
export interface NationState {
  id: NationId; pp: number; stability: number; support: number; manpower: number; fuel: number;
  stock: Record<Equipment, number>; allocation: Record<Equipment, number>; efficiency: Record<Equipment, number>;
  research: ResearchJob[]; techs: string[]; focus: { id: string; progress: number } | null; focuses: string[];
  construction: BuildJob[]; recruitment: RecruitJob[]; allies: NationId[]; relations: number[];
  justification: { target: NationId; readyDay: number } | null; trade: NationId | null;
  airMission: AirMission; navalMission: NavalMission; mobilization: number; capitulated: boolean;
}
export interface Division {
  /** Strength and organization use 0..100; entrenchment uses 0..1. */
  id: number; nation: NationId; province: number; type: UnitType; hp: number; org: number; entrenchment: number;
  path: number[]; progress: number; experience: number;
}
export interface Battle { province: number; attacker: NationId; defender: NationId; balance: number; days: number }
export interface Dispatch { day: number; text: string; kind: 'info' | 'battle' | 'research' | 'diplomacy' }
export interface Campaign {
  version: 1; seed: number; day: number; player: NationId; phase: 'setup' | 'playing' | 'victory' | 'defeat';
  provinces: ProvinceState[]; nations: NationState[]; divisions: Division[]; wars: [NationId, NationId][];
  /** Tension uses 0..100; national stability and support use 0..1. */
  battles: Battle[]; dispatches: Dispatch[]; nextId: number; tension: number; score: number;
}
export type Command =
  | { type: 'allocation'; equipment: Equipment; delta: number }
  | { type: 'research'; tech: string }
  | { type: 'focus'; focus: string }
  | { type: 'build'; province: number; kind: Building }
  | { type: 'cancel-build'; index: number }
  | { type: 'recruit'; unit: UnitType }
  | { type: 'order'; units: number[]; target: number }
  | { type: 'halt'; units: number[] }
  | { type: 'front'; target: NationId }
  | { type: 'justify'; target: NationId }
  | { type: 'declare'; target: NationId }
  | { type: 'relations'; target: NationId }
  | { type: 'alliance'; target: NationId }
  | { type: 'trade'; target: NationId | null }
  | { type: 'air'; mission: AirMission }
  | { type: 'navy'; mission: NavalMission }
  | { type: 'mobilize' }
  | { type: 'rally' };
export interface CommandResult { ok: boolean; message: string }
export type MapMode = 'political' | 'terrain' | 'supply';
export interface MapView { selected: number | null; units: number[]; mode: MapMode; zoom: number; panX: number; panY: number }
