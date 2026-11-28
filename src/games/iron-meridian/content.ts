import type { Building, Equipment, UnitType } from './types';

export interface Technology {
  id: string; name: string; branch: 'army' | 'industry' | 'air' | 'navy';
  days: number; requires: string[]; description: string;
}
export interface NationalFocus {
  id: string; name: string; branch: string; days: number; requires: string[]; description: string;
}

export const TECHS: Technology[] = [
  { id: 'field-drill', name: 'Field drill', branch: 'army', days: 40, requires: [], description: 'Land attack +15%.' },
  { id: 'support-guns', name: 'Support guns', branch: 'army', days: 60, requires: ['field-drill'], description: 'Infantry attack +15%.' },
  { id: 'mobile-warfare', name: 'Mobile warfare', branch: 'army', days: 75, requires: ['field-drill'], description: 'Mobile attack and movement +20%.' },
  { id: 'machine-tools', name: 'Machine tools', branch: 'industry', days: 45, requires: [], description: 'Production and construction +20%.' },
  { id: 'assembly-lines', name: 'Assembly lines', branch: 'industry', days: 80, requires: ['machine-tools'], description: 'Factory efficiency cap rises to 95%.' },
  { id: 'logistics', name: 'Field logistics', branch: 'industry', days: 55, requires: ['machine-tools'], description: 'Supply +20%; faster organization recovery.' },
  { id: 'airframes', name: 'New airframes', branch: 'air', days: 50, requires: [], description: 'Air mission strength +25%.' },
  { id: 'close-support', name: 'Close support', branch: 'air', days: 70, requires: ['airframes'], description: 'Air support damage +30%.' },
  { id: 'hull-design', name: 'Hull design', branch: 'navy', days: 50, requires: [], description: 'Naval mission strength +25%.' },
  { id: 'convoy-escorts', name: 'Convoy escorts', branch: 'navy', days: 70, requires: ['hull-design'], description: 'Convoy losses and supply disruption halved.' },
];

export const FOCUSES: NationalFocus[] = [
  { id: 'civic-plan', name: 'Civic plan', branch: 'Industry', days: 24, requires: [], description: 'Gain a civilian factory and 5% stability.' },
  { id: 'industrial-drive', name: 'Industrial drive', branch: 'Industry', days: 32, requires: ['civic-plan'], description: 'Production and construction +10%.' },
  { id: 'arsenal', name: 'National arsenal', branch: 'Industry', days: 36, requires: ['industrial-drive'], description: 'Gain two military factories.' },
  { id: 'officer-school', name: 'Officer school', branch: 'Army', days: 24, requires: [], description: 'Gain 5,000 manpower and 5% war support.' },
  { id: 'war-economy', name: 'War economy', branch: 'Army', days: 32, requires: ['officer-school'], description: 'Gain 60 political power and 10% war support.' },
  { id: 'national-resolve', name: 'National resolve', branch: 'Army', days: 40, requires: ['war-economy'], description: 'Land attack +10%; gain 8% stability.' },
  { id: 'open-ports', name: 'Open ports', branch: 'Maritime', days: 24, requires: [], description: 'Gain a dockyard and 100 fuel.' },
  { id: 'sea-lanes', name: 'Secure sea lanes', branch: 'Maritime', days: 36, requires: ['open-ports'], description: 'Naval strength +20%; sea supply +10%.' },
];

export const EQUIPMENT: Record<Equipment, { name: string; cost: number; steel: number; oil: number }> = {
  rifles: { name: 'Rifles', cost: 1, steel: 1, oil: 0 },
  artillery: { name: 'Artillery', cost: 3, steel: 2, oil: 0 },
  tanks: { name: 'Tanks', cost: 9, steel: 3, oil: 1 },
  aircraft: { name: 'Aircraft', cost: 8, steel: 2, oil: 1 },
  ships: { name: 'Ships', cost: 36, steel: 4, oil: 1 },
};

export const TEMPLATES: Record<UnitType, {
  name: string; days: number; manpower: number; equipment: Partial<Record<Equipment, number>>;
  attack: number; defense: number; speed: number; supply: number; width: number;
}> = {
  infantry: { name: 'Infantry', days: 18, manpower: 1_000, equipment: { rifles: 80, artillery: 8 }, attack: 11, defense: 18, speed: 0.38, supply: 1, width: 1 },
  motorized: { name: 'Motorized', days: 24, manpower: 1_200, equipment: { rifles: 90, artillery: 10, tanks: 6 }, attack: 16, defense: 15, speed: 0.62, supply: 1.5, width: 1 },
  armored: { name: 'Armor', days: 32, manpower: 1_500, equipment: { rifles: 50, artillery: 12, tanks: 24 }, attack: 27, defense: 22, speed: 0.5, supply: 2.4, width: 2 },
};

export const BUILDINGS: Record<Building, { name: string; cost: number; max: number }> = {
  civilian: { name: 'Civilian factory', cost: 100, max: 8 },
  military: { name: 'Military factory', cost: 120, max: 8 },
  dockyard: { name: 'Dockyard', cost: 140, max: 6 },
  infrastructure: { name: 'Infrastructure', cost: 70, max: 5 },
  fort: { name: 'Fort', cost: 75, max: 5 },
};
