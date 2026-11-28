import { describe, expect, it } from 'vitest';
import { BUILDINGS, FOCUSES, TECHS, TEMPLATES } from '../../../src/games/iron-meridian/content';
import { PROVINCES } from '../../../src/games/iron-meridian/map-data';
import { advanceDay, atWar, availableFactories, canFocus, canResearch, capitalOf, createCampaign, industry, issue, restoreCampaign, serializeCampaign, startCampaign, supplyAt } from '../../../src/games/iron-meridian/model';
import type { Campaign, Command, Division, NationId } from '../../../src/games/iron-meridian/types';

function playing(player: NationId = 0): Campaign {
  const c = createCampaign(player, 123);
  startCampaign(c);
  return c;
}
function days(c: Campaign, count: number): void { for (let i = 0; i < count; i++) advanceDay(c); }
function quiet(c: Campaign): void {
  for (const n of c.nations) n.allocation = { rifles: 0, artillery: 0, tanks: 0, aircraft: 0, ships: 0 };
}
function border(): [number, number] {
  const source = PROVINCES.find(p => p.home === 0 && p.neighbors.some(id => PROVINCES[id].home === 1))!;
  return [source.id, source.neighbors.find(id => PROVINCES[id].home === 1)!];
}
function division(id: number, nation: NationId, province: number): Division {
  return { id, nation, province, type: 'infantry', hp: 100, org: 100, entrenchment: 0, path: [], progress: 0, experience: 0 };
}

describe('Iron Meridian campaign', () => {
  it('starts in setup and advances only after the player starts', () => {
    const campaign = createCampaign(0, 123);
    expect(campaign.phase).toBe('setup');
    expect(issue(campaign, { type: 'rally' }).ok).toBe(false);
    advanceDay(campaign);
    expect(campaign.day).toBe(0);
    startCampaign(campaign);
    advanceDay(campaign);
    expect(campaign.day).toBe(1);
  });

  it('allocates existing capacity and rejects invalid or overflowing allocation without mutation', () => {
    const c = playing();
    expect(availableFactories(c, 0)).toBe(0);
    const before = serializeCampaign(c);
    for (const delta of [1, 0, 0.5, NaN, Infinity, -999]) expect(issue(c, { type: 'allocation', equipment: 'rifles', delta }).ok).toBe(false);
    expect(serializeCampaign(c)).toEqual(before);
    expect(issue(c, { type: 'allocation', equipment: 'rifles', delta: -1 }).ok).toBe(true);
    expect(availableFactories(c, 0)).toBe(1);
    const efficiency = c.nations[0].efficiency.artillery;
    expect(issue(c, { type: 'allocation', equipment: 'artillery', delta: 1 }).ok).toBe(true);
    expect(c.nations[0].efficiency.artillery).toBeLessThan(efficiency);
  });

  it('connects factories, efficiency, resource imports and daily equipment production', () => {
    const c = playing();
    const baseline = restoreCampaign(serializeCampaign(c))!;
    const steel = industry(c, 0).steel;
    expect(issue(c, { type: 'trade', target: 1 }).ok).toBe(true);
    expect(industry(c, 0).steel).toBe(steel + 6);
    expect(industry(c, 0).civilian).toBe(industry(baseline, 0).civilian - 1);
    const stock = c.nations[0].stock.rifles;
    const efficiency = c.nations[0].efficiency.rifles;
    days(c, 15);
    expect(c.nations[0].stock.rifles).toBeGreaterThan(stock);
    expect(c.nations[0].efficiency.rifles).toBeGreaterThan(efficiency);
    const halted = playing(); quiet(halted);
    const haltedStock = halted.nations[0].stock.rifles;
    days(halted, 15);
    expect(halted.nations[0].stock.rifles).toBe(haltedStock);
    expect(issue(c, { type: 'trade', target: null }).ok).toBe(true);
    expect(industry(c, 0).steel).toBe(steel);
  });

  it('runs two research slots and unlocks dependent technology only after completion', () => {
    const c = playing();
    expect(canResearch(c, 0, 'assembly-lines')).toBe(false);
    expect(issue(c, { type: 'research', tech: 'assembly-lines' }).ok).toBe(false);
    expect(issue(c, { type: 'research', tech: 'field-drill' }).ok).toBe(true);
    expect(issue(c, { type: 'research', tech: 'machine-tools' }).ok).toBe(true);
    expect(issue(c, { type: 'research', tech: 'airframes' }).ok).toBe(false);
    days(c, 45);
    expect(c.nations[0].techs).toContain('field-drill');
    expect(c.nations[0].techs).toContain('machine-tools');
    expect(c.nations[0].research).toHaveLength(0);
    expect(canResearch(c, 0, 'assembly-lines')).toBe(true);
    expect(issue(c, { type: 'research', tech: 'machine-tools' }).ok).toBe(false);
  });

  it('applies national focus rewards and prerequisite branches', () => {
    const c = playing();
    expect(canFocus(c, 0, 'industrial-drive')).toBe(false);
    expect(issue(c, { type: 'focus', focus: 'arsenal' }).ok).toBe(false);
    const civilian = industry(c, 0).civilian;
    expect(issue(c, { type: 'focus', focus: 'civic-plan' }).ok).toBe(true);
    expect(issue(c, { type: 'focus', focus: 'officer-school' }).ok).toBe(false);
    days(c, 24);
    expect(c.nations[0].focuses).toContain('civic-plan');
    expect(industry(c, 0).civilian).toBe(civilian + 1);
    expect(canFocus(c, 0, 'industrial-drive')).toBe(true);
    expect(issue(c, { type: 'focus', focus: 'industrial-drive' }).ok).toBe(true);
  });

  it('builds one queue item at a time and supports cancelling queued work', () => {
    const c = playing();
    const capital = capitalOf(c, 0)!;
    const old = c.provinces[capital].military;
    expect(issue(c, { type: 'build', province: capital, kind: 'military' }).ok).toBe(true);
    expect(issue(c, { type: 'build', province: capital, kind: 'fort' }).ok).toBe(true);
    days(c, 8);
    expect(c.nations[0].construction[0].progress).toBeGreaterThan(0);
    expect(c.nations[0].construction[1].progress).toBe(0);
    expect(issue(c, { type: 'cancel-build', index: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'cancel-build', index: 1 }).ok).toBe(false);
    days(c, 24);
    expect(c.provinces[capital].military).toBe(old + 1);
    expect(c.nations[0].construction).toHaveLength(0);
    expect(issue(c, { type: 'build', province: capital, kind: 'dockyard' }).ok).toBe(false);
    expect(issue(c, { type: 'build', province: capitalOf(c, 1)!, kind: 'fort' }).ok).toBe(false);
  });

  it('keeps legal saves restorable when a focus factory reward overlaps a full construction queue', () => {
    const c = playing(); const capital = capitalOf(c, 0)!;
    for (let i = c.provinces[capital].civilian; i < BUILDINGS.civilian.max; i++) {
      expect(issue(c, { type: 'build', province: capital, kind: 'civilian' }).ok).toBe(true);
    }
    expect(issue(c, { type: 'focus', focus: 'civic-plan' }).ok).toBe(true);
    days(c, 24);
    expect(restoreCampaign(serializeCampaign(c)) !== null).toBe(true);
    expect(c.provinces[capital].civilian + c.nations[0].construction.length).toBe(BUILDINGS.civilian.max);
    expect(c.nations[0].construction[0].progress).toBeGreaterThan(0);
    days(c, 100);
    expect(c.provinces[capital].civilian).toBe(BUILDINGS.civilian.max);
    expect(restoreCampaign(serializeCampaign(c)) !== null).toBe(true);
  });

  it('reserves equipment and manpower once and deploys a trained division', () => {
    const c = playing(); quiet(c);
    const n = c.nations[0];
    const count = c.divisions.filter(d => d.nation === 0).length;
    const manpower = n.manpower;
    const rifles = n.stock.rifles;
    expect(issue(c, { type: 'recruit', unit: 'infantry' }).ok).toBe(true);
    expect(n.manpower).toBe(manpower - TEMPLATES.infantry.manpower);
    expect(n.stock.rifles).toBe(rifles - 80);
    days(c, 18);
    expect(c.divisions.filter(d => d.nation === 0)).toHaveLength(count + 1);
    expect(n.recruitment).toHaveLength(0);
    expect(n.stock.rifles).toBe(rifles - 80);
    n.stock.rifles = 0;
    const before = serializeCampaign(c);
    expect(issue(c, { type: 'recruit', unit: 'infantry' }).ok).toBe(false);
    expect(serializeCampaign(c)).toEqual(before);
  });

  it('rejects foreign orders, moves owned divisions and halts active movement', () => {
    const c = playing();
    const own = c.divisions.find(d => d.nation === 0)!;
    const foreign = c.divisions.find(d => d.nation === 1)!;
    const target = PROVINCES[own.province].neighbors.find(p => c.provinces[p].owner === 0)!;
    expect(issue(c, { type: 'order', units: [foreign.id], target }).ok).toBe(false);
    expect(issue(c, { type: 'order', units: [own.id], target: capitalOf(c, 1)! }).ok).toBe(false);
    expect(issue(c, { type: 'order', units: [own.id], target }).ok).toBe(true);
    days(c, 8);
    expect(own.province).toBe(target);
    expect(issue(c, { type: 'order', units: [own.id], target: capitalOf(c, 0)! }).ok).toBe(true);
    expect(issue(c, { type: 'halt', units: [own.id] }).ok).toBe(true);
    expect(own.path).toEqual([]);
  });

  it('requires a completed justification, then starts a real war and front orders', () => {
    const c = playing();
    expect(issue(c, { type: 'declare', target: 1 }).ok).toBe(false);
    expect(issue(c, { type: 'justify', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'justify', target: 2 }).ok).toBe(false);
    days(c, 23);
    expect(issue(c, { type: 'declare', target: 1 }).ok).toBe(false);
    days(c, 1);
    expect(issue(c, { type: 'declare', target: 1 }).ok).toBe(true);
    expect(atWar(c, 0, 1)).toBe(true);
    expect(issue(c, { type: 'front', target: 1 }).ok).toBe(true);
    expect(c.divisions.some(d => d.nation === 0 && d.path.length > 0)).toBe(true);
    expect(issue(c, { type: 'relations', target: 1 }).ok).toBe(false);
    expect(issue(c, { type: 'trade', target: 1 }).ok).toBe(false);
  });

  it('forms reciprocal alliances, permits access and brings allies into a war', () => {
    const c = playing(); c.nations[0].pp = 1_000;
    expect(issue(c, { type: 'alliance', target: 1 }).ok).toBe(false);
    expect(issue(c, { type: 'relations', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'relations', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'alliance', target: 1 }).ok).toBe(true);
    expect(c.nations[1].allies).toContain(0);
    const own = c.divisions.find(d => d.nation === 0)!;
    expect(issue(c, { type: 'order', units: [own.id], target: capitalOf(c, 1)! }).ok).toBe(true);
    expect(issue(c, { type: 'justify', target: 1 }).ok).toBe(false);
    expect(issue(c, { type: 'justify', target: 4 }).ok).toBe(true);
    days(c, 24);
    expect(issue(c, { type: 'declare', target: 4 }).ok).toBe(true);
    expect(atWar(c, 1, 4)).toBe(true);
  });

  it('clears war justifications when diplomacy makes their targets invalid', () => {
    const c = playing(); c.nations[0].pp = 1_000;
    expect(issue(c, { type: 'justify', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'relations', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'relations', target: 1 }).ok).toBe(true);
    expect(issue(c, { type: 'alliance', target: 1 }).ok).toBe(true);
    expect(c.nations[0].justification).toBeNull();
    expect(issue(c, { type: 'justify', target: 2 }).ok).toBe(true);

    const war = playing();
    expect(issue(war, { type: 'justify', target: 1 }).ok).toBe(true);
    war.player = 1;
    expect(issue(war, { type: 'justify', target: 0 }).ok).toBe(true);
    days(war, 24);
    expect(issue(war, { type: 'declare', target: 0 }).ok).toBe(true);
    expect(war.nations[0].justification).toBeNull();
    war.player = 0;
    expect(issue(war, { type: 'justify', target: 2 }).ok).toBe(true);
    expect(restoreCampaign(serializeCampaign(war))).not.toBeNull();
  });

  it('mobilizes reservists and rallies public support with political costs', () => {
    const c = playing(); c.nations[0].pp = 1_000;
    const n = c.nations[0]; const manpower = n.manpower; const stability = n.stability;
    for (let i = 0; i < 3; i++) expect(issue(c, { type: 'mobilize' }).ok).toBe(true);
    expect(n.manpower).toBe(manpower + 36_000);
    expect(n.stability).toBeLessThan(stability);
    expect(issue(c, { type: 'mobilize' }).ok).toBe(false);
    const before = n.stability;
    expect(issue(c, { type: 'rally' }).ok).toBe(true);
    expect(n.stability).toBeGreaterThan(before);
  });

  it('uses fuel for air and naval missions and stops missions when fuel runs out', () => {
    const c = playing();
    expect(issue(c, { type: 'air', mission: 'support' }).ok).toBe(true);
    expect(issue(c, { type: 'navy', mission: 'patrol' }).ok).toBe(true);
    const n = c.nations[0];
    n.fuel = 0;
    for (const p of PROVINCES) if (p.home === 0 && p.oil > 0) c.provinces[p.id].owner = 1;
    advanceDay(c);
    expect(n.airMission).toBe('reserve');
    expect(n.navalMission).toBe('reserve');
    expect(issue(c, { type: 'air', mission: 'support' }).ok).toBe(false);
  });

  it('cuts supply in isolated territory and restores port supply using a fueled patrol', () => {
    const c = playing();
    c.provinces[82].owner = 0;
    expect(supplyAt(c, 0, 82)).toBeLessThan(0.1);
    expect(issue(c, { type: 'navy', mission: 'patrol' }).ok).toBe(true);
    const supplied = supplyAt(c, 0, 82);
    expect(supplied).toBeGreaterThan(0.2);
    c.wars = [[0, 5]];
    c.nations[5].navalMission = 'raiding'; c.nations[5].stock.ships = 100;
    expect(supplyAt(c, 0, 82)).toBeLessThan(supplied);
    c.nations[0].stock.ships = 500;
    expect(supplyAt(c, 0, 82)).toBeGreaterThan(0.2);
  });

  it('requires a fleet on patrol to transport troops to the island', () => {
    const c = playing(); c.wars = [[0, 5]];
    c.divisions = [division(1, 0, 16)]; c.nextId = 2;
    expect(issue(c, { type: 'order', units: [1], target: 82 }).ok).toBe(false);
    expect(issue(c, { type: 'navy', mission: 'patrol' }).ok).toBe(true);
    expect(issue(c, { type: 'order', units: [1], target: 82 }).ok).toBe(true);
    days(c, 15);
    expect(c.divisions.find(d => d.id === 1)!.province).toBe(82);
    expect(c.provinces[82].owner).toBe(0);
  });

  it('resolves sustained land combat, retreats defenders and captures territory', () => {
    const c = playing(); c.wars = [[0, 1]];
    const [from, target] = border();
    c.divisions = [1, 2, 3, 4].map(id => division(id, 0, from));
    c.divisions.push(division(5, 1, target)); c.nextId = 6;
    expect(issue(c, { type: 'order', units: [1, 2, 3, 4], target }).ok).toBe(true);
    for (const d of c.divisions.filter(d => d.nation === 0)) d.progress = 1;
    advanceDay(c);
    expect(c.battles.some(b => b.province === target)).toBe(true);
    days(c, 24);
    expect(c.provinces[target].owner).toBe(0);
    expect(c.dispatches.some(d => d.text.includes('won the battle'))).toBe(true);
    expect(c.divisions.some(d => d.experience > 0)).toBe(true);
  });

  it('pins defending divisions once engaged even when they have another movement order', () => {
    const c = playing(); c.wars = [[0, 1]];
    const [from, target] = border();
    c.divisions = [division(1, 0, from), division(2, 1, target)]; c.nextId = 3;
    c.divisions[0].path = [target]; c.divisions[0].progress = 1;
    const retreat = PROVINCES[target].neighbors.find(p => c.provinces[p].owner === 1)!;
    c.divisions[1].path = [retreat]; c.divisions[1].progress = 1;
    advanceDay(c);
    expect(c.divisions[1].province).toBe(target);
    expect(c.battles).toHaveLength(1);
  });

  it('does not reuse an attack after its division retreats from an earlier battle', () => {
    const c = playing(); c.wars = [[0, 1]];
    c.divisions = [1, 2, 3, 4, 5, 6].map(id => division(id, 0, 1));
    for (const unit of c.divisions) { unit.path = [26]; unit.progress = 1; }
    const retreating = division(7, 1, 26);
    retreating.org = 8; retreating.path = [2]; retreating.progress = 1;
    const bystander = division(8, 0, 2);
    c.divisions.push(retreating, bystander); c.nextId = 9;
    advanceDay(c);
    expect(retreating.province).not.toBe(26);
    expect(retreating.path).toEqual([]);
    expect(c.battles.some(b => b.province === 2)).toBe(false);
    expect(bystander.hp).toBe(100);
    expect(retreating.experience).toBe(0.008);
  });

  it('rejects sparse arrays before cloning untrusted snapshots', () => {
    const c = playing();
    for (const corrupt of [
      (data: Campaign) => { data.divisions = new Array(1); },
      (data: Campaign) => { delete data.provinces[0]; },
      (data: Campaign) => { delete data.nations[0].relations[0]; },
      (data: Campaign) => { data.nations[0].research = new Array(1); },
    ]) {
      const data = serializeCampaign(c) as Campaign; corrupt(data);
      expect(restoreCampaign(data)).toBeNull();
    }
  });

  it('makes forts and entrenched terrain resist attacks more strongly', () => {
    const open = playing(); open.wars = [[0, 1]];
    const [from, target] = border();
    open.divisions = [division(1, 0, from), division(2, 1, target)]; open.nextId = 3;
    open.provinces[target].fort = 0;
    expect(issue(open, { type: 'order', units: [1], target }).ok).toBe(true);
    const fortified = restoreCampaign(serializeCampaign(open))!;
    expect(fortified).not.toBeNull();
    fortified.provinces[target].fort = 5;
    fortified.divisions[1].entrenchment = 1;
    for (const c of [open, fortified]) { c.divisions[0].progress = 1; advanceDay(c); }
    expect(fortified.divisions[0].org).toBeLessThan(open.divisions[0].org);
    expect(fortified.divisions[1].org).toBeGreaterThan(open.divisions[1].org);
  });

  it('makes air superiority and support change battle damage', () => {
    const c = playing(); c.wars = [[0, 1]];
    const [from, target] = border();
    c.divisions = [division(1, 0, from), division(2, 1, target)]; c.nextId = 3;
    issue(c, { type: 'order', units: [1], target }); c.divisions[0].progress = 1;
    const supported = restoreCampaign(serializeCampaign(c))!;
    supported.nations[0].airMission = 'support'; supported.nations[0].stock.aircraft = 60;
    advanceDay(c); advanceDay(supported);
    expect(supported.divisions[1].org).toBeLessThan(c.divisions[1].org);
    expect(supported.battles[0].balance).toBeGreaterThan(c.battles[0].balance);
  });

  it('capitulates a nation only after its capital and 60% of home victory points are lost', () => {
    const c = playing(); c.wars = [[0, 1]];
    const capital = PROVINCES.find(p => p.home === 1 && p.capital)!;
    c.provinces[capital.id].owner = 0;
    advanceDay(c);
    expect(c.nations[1].capitulated).toBe(false);
    for (const p of PROVINCES) if (p.home === 1) c.provinces[p.id].owner = 0;
    advanceDay(c);
    expect(c.nations[1].capitulated).toBe(true);
    expect(c.divisions.some(d => d.nation === 1)).toBe(false);
    expect(atWar(c, 0, 1)).toBe(false);
    expect(restoreCampaign(serializeCampaign(c))).not.toBeNull();
  });

  it('ends in defeat when the player capitulates and stops advancing', () => {
    const c = playing(); c.wars = [[0, 1]];
    for (const p of PROVINCES) if (p.home === 0) c.provinces[p.id].owner = 1;
    advanceDay(c);
    expect(c.phase).toBe('defeat');
    const day = c.day; advanceDay(c);
    expect(c.day).toBe(day);
    expect(issue(c, { type: 'rally' }).ok).toBe(false);
  });

  it('offers an achievable alliance victory through real diplomatic commands', () => {
    const c = playing(); c.nations[0].pp = 1_000;
    for (const target of [1, 2, 3, 4] as NationId[]) {
      issue(c, { type: 'relations', target }); issue(c, { type: 'relations', target });
      expect(issue(c, { type: 'alliance', target }).ok).toBe(true);
    }
    advanceDay(c);
    expect(c.phase).toBe('victory');
    expect(c.score).toBeGreaterThan(0);
    expect(restoreCampaign(serializeCampaign(c))).not.toBeNull();
  });

  it('runs deterministic strategic AI and resumes a save with identical future outcomes', () => {
    const c = playing();
    issue(c, { type: 'research', tech: 'machine-tools' }); issue(c, { type: 'focus', focus: 'civic-plan' });
    days(c, 160);
    expect(c.nations[1].techs.length).toBeGreaterThan(0);
    expect(c.nations[1].focuses.length).toBeGreaterThan(0);
    expect(c.nations[1].construction.length).toBeGreaterThan(0);
    expect(c.dispatches.some(d => d.kind === 'diplomacy')).toBe(true);
    const saved = serializeCampaign(c);
    const restored = restoreCampaign(saved);
    expect(restored).not.toBeNull();
    expect(restored).toEqual(c);
    days(c, 120); days(restored!, 120);
    expect(restored).toEqual(c);
  });

  it('clones accepted snapshots so saved and restored objects cannot mutate the active game', () => {
    const c = playing();
    const saved = serializeCampaign(c) as Campaign;
    const restored = restoreCampaign(saved)!;
    saved.nations[0].stock.rifles = 0;
    restored.divisions[0].hp = 1;
    expect(c.nations[0].stock.rifles).toBe(240);
    expect(restored.nations[0].stock.rifles).toBe(240);
    expect(c.divisions[0].hp).toBe(100);
  });

  it('rejects malformed, nonfinite, oversized and semantically invalid saves', () => {
    const c = playing();
    const corruptions: ((d: Campaign) => void)[] = [
      d => { d.seed = NaN; }, d => { d.day = Infinity; }, d => { d.player = 99 as NationId; },
      d => { d.nations[0].stock.rifles = -1; }, d => { d.nations[0].fuel = 1e30; },
      d => { d.nations[0].allocation.rifles = 100; }, d => { d.nations[0].research = [{ tech: 'invented', progress: 1 }]; },
      d => { d.nations[0].techs = ['assembly-lines']; }, d => { d.nations[0].allies = [1]; },
      d => { d.nations[0].relations = [1]; }, d => { d.nations[0].focus = { id: 'arsenal', progress: 2 }; },
      d => { d.divisions[0].hp = NaN; }, d => { d.divisions[0].province = -1; },
      d => { d.divisions[0].path = [75]; }, d => { d.divisions[1].id = d.divisions[0].id; },
      d => { d.provinces[0].military = BUILDINGS.military.max + 1; },
      d => { d.wars = [[0, 0]]; }, d => { d.nextId = 1; },
      d => { d.dispatches[0].text = 'x'.repeat(221); },
      d => { d.nations[0].recruitment = [{ type: 'infantry', progress: 1e9 }]; },
      d => { d.phase = { toString: () => 'playing' } as unknown as Campaign['phase']; },
      d => { d.nations[0].airMission = { toString: () => 'reserve' } as unknown as Campaign['nations'][number]['airMission']; },
      d => { d.provinces[0].dockyard = 1; },
    ];
    for (const corrupt of corruptions) {
      const data = serializeCampaign(c) as Campaign; corrupt(data);
      expect(restoreCampaign(data), corrupt.toString()).toBeNull();
    }
    expect(restoreCampaign(null)).toBeNull();
    expect(restoreCampaign({ ...c, provinces: new Array(10_000).fill(c.provinces[0]) })).toBeNull();
    const pollution = JSON.parse(JSON.stringify(c)); pollution.__proto__ = { evil: true };
    expect(restoreCampaign(pollution)).toBeNull();
  });

  it('keeps valid campaign snapshots bounded through long AI campaigns from every starting nation', () => {
    for (const player of [0, 1, 2, 3, 4, 5] as NationId[]) {
      const c = playing(player);
      for (let turn = 0; turn < 500 && c.phase === 'playing'; turn++) {
        if (turn % 25 === 0) {
          expect(restoreCampaign(serializeCampaign(c)), `player ${player}, day ${c.day}`).not.toBeNull();
          if (c.nations[player].pp >= 35 && c.nations[player].stability < 0.8) issue(c, { type: 'rally' });
        }
        advanceDay(c);
      }
      expect(restoreCampaign(serializeCampaign(c)), `player ${player}, final day ${c.day}`).not.toBeNull();
    }
  });

  it('clamps mobilization at the manpower reserve limit', () => {
    const c = playing(); c.nations[0].manpower = 999_999;
    expect(issue(c, { type: 'mobilize' }).ok).toBe(true);
    expect(c.nations[0].manpower).toBe(1_000_000);
    expect(restoreCampaign(serializeCampaign(c))).not.toBeNull();
  });

  it('rejects unknown content and malformed commands without throwing', () => {
    const c = playing();
    const commands = [
      { type: 'research', tech: '__proto__' }, { type: 'focus', focus: 'missing' },
      { type: 'build', province: 0, kind: '__proto__' }, { type: 'recruit', unit: 'constructor' },
      { type: 'order', units: [1, 1], target: 0 }, { type: 'halt', units: [NaN] },
      { type: 'air', mission: 'nuclear' }, { type: 'navy', mission: 'nuclear' }, { type: 'front', target: 0 },
      { type: 'allocation', equipment: '__proto__', delta: 1 }, { type: 'unknown' },
    ];
    for (const command of commands) expect(issue(c, command as Command).ok).toBe(false);
    expect(TECHS.length).toBeGreaterThan(6); expect(FOCUSES.length).toBeGreaterThan(4);
  });
});
