import type { GameModule } from '../../core/types';
import type { BuildJob, Building, Campaign, Command, Equipment, MapMode, MapView, NationId, UnitType } from './types';
import { NATIONS, PROVINCES } from './map-data';
import { BUILDINGS, EQUIPMENT, FOCUSES, TECHS, TEMPLATES } from './content';
import { advanceDay, atWar, availableFactories, canFocus, canResearch, createCampaign, industry, issue, restoreCampaign, serializeCampaign, startCampaign, supplyAt } from './model';
import { createRenderer } from './render';
import './style.css';

const escape = (value: unknown) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const number = (value: number) => value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(Math.floor(value));
const percent = (value: number) => `${Math.round(value * 100)}%`;
const date = (day: number) => new Date(Date.UTC(1936, 0, 1 + day)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
const equipmentIds: Equipment[] = ['rifles', 'artillery', 'tanks', 'aircraft', 'ships'];
const MIN_ZOOM = .15;
const tabs = ['Command', 'Forces', 'Industry', 'Research', 'Statecraft'] as const;
type Tab = typeof tabs[number];
const icons: Record<string, string> = {
  Command: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z"/><path d="M12 8v8M8 12h8"/>',
  Forces: '<path d="m5 4 15 15m-1-15L4 19M3 16l5 5m8-18 5 5M3 3l5 1-4 4Zm18 18-5-1 4-4Z"/>',
  Industry: '<path d="M3 20V10l6 3V8l6 4V4h4l2 16ZM7 17h1m4 0h1m4 0h1"/>',
  Research: '<path d="M9 3h6m-5 0v7L4 20h16l-6-10V3M7 15h10"/>',
  Statecraft: '<path d="M12 3 2 9h20ZM5 10v8m5-8v8m4-8v8m5-8v8M2 21h20"/>',
  people: '<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4m1-17a3 3 0 0 1 0 6m3 11v-4a5 5 0 0 0-2-4"/>',
  fuel: '<path d="M5 21V4h10v17M7 8h6m-8 5h10m0-6 4 3v7a2 2 0 0 0 4 0v-5l-3-3M3 21h14"/>',
  power: '<path d="m14 2-9 12h7l-2 8 9-12h-7Z"/>',
};
const icon = (name: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? icons.Command}</svg>`;
const meter = (value: number, label: string) => `<div class="im-meter" role="meter" aria-label="${escape(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(Math.max(0, Math.min(1, value)) * 100)}"><i style="width:${Math.max(0, Math.min(100, value * 100))}%"></i></div>`;
const button = (label: string, action: string, attrs = '', disabled = false, cls = '') => `<button type="button" class="im-button ${cls}" data-action="${action}" data-focus="${action}-${escape(attrs)}" ${attrs} ${disabled ? 'disabled' : ''}>${label}</button>`;

const rules = `Lead one of six nations in a fictional 1936 campaign. Build an economy, equip divisions, research technology and pursue national focuses. Control 60% of the world's victory points and three original capitals with your allies to win. Losing your capital and most of your home victory points ends your campaign.

Time begins paused. Use Run, the speed controls or Next day. The app menu and Study pause the entire game. No time passes while the game is closed.

Select a province on the map or in Command. Select your divisions in Forces, then use Move / attack and tap a destination, or choose a destination in the order form. Drag the map to pan; scroll or use + and - to zoom. Shift-click adds divisions. Right-click issues an order. Space runs or stops time; N advances a day; 1 to 5 opens a panel. Arrow keys pan. These shortcuts are disabled in form fields.

Industry allocates military factories to rifles, artillery, tanks and aircraft. Dockyards build ships. New production lines grow in efficiency. Construction uses civilian factories. Recruitment reserves equipment and manpower; training takes time. Capital-connected supply and infrastructure sustain organization. Encircled troops suffer attrition. Mountains, forests, forts and entrenched defenders slow attacks.

Research has two slots and prerequisite technologies. One national focus can run at a time. Air support and superiority use aircraft and fuel. Naval patrols support sea transport between ports; raiding disrupts enemy supply. Improve relations to form alliances, or justify a war before declaring it. An ally joins its partner's wars. Trade reserves civilian industry for extra resources.

All opponents are local computer players. Iron Meridian has original nations, map, artwork and tuning. It is not a complete implementation of Hearts of Iron IV.`;

const game: GameModule = {
  id: 'iron-meridian', title: 'Iron Meridian', cover: 'game-art/iron-meridian/cover.svg', rules,
  mount(container, context) {
    const root = document.createElement('div');
    root.className = 'im-game';
    root.innerHTML = `<canvas class="im-map" tabindex="0" role="img" aria-label="Strategic province map. Drag to pan and scroll to zoom. Use the Command and Forces panels for keyboard province selection and orders."></canvas>
      <header class="im-header"><div class="im-identity im-glass"><span class="im-crest">${icon('Command')}</span><div><small>GENERAL STAFF</small><strong>Iron Meridian</strong></div></div><div class="im-resources im-glass" aria-label="National resources"></div><div class="im-clock im-glass"></div></header>
      <div class="im-theater"><span>WESTERN THEATER</span><i></i><span class="im-map-caption">POLITICAL MAP</span></div>
      <nav class="im-tabs im-glass" aria-label="Headquarters panels">${tabs.map((tab, i) => `<button type="button" data-tab="${tab}" aria-label="${tab}" aria-expanded="false" title="${tab} (${i + 1})">${icon(tab)}<span>${tab}</span></button>`).join('')}</nav>
      <aside class="im-panel im-glass" aria-label="Headquarters" hidden></aside>
      <div class="im-map-tools im-glass" aria-label="Map controls"><button type="button" data-action="zoom-in" aria-label="Zoom in">+</button><button type="button" data-action="zoom-out" aria-label="Zoom out">−</button><button type="button" data-action="fit" aria-label="Fit map">⌖</button><select aria-label="Map mode" class="im-mode"><option value="political">Political</option><option value="terrain">Terrain</option><option value="supply">Supply</option></select></div>
      <aside class="im-feed im-glass" aria-label="Field reports"><span class="im-eyebrow">FIELD REPORTS</span><div></div></aside>
      <div class="im-notice" role="status" aria-live="polite"></div>
      <section class="im-setup" aria-label="New campaign"></section>
      <div class="im-end" hidden></div>`;
    container.append(root);
    const q = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
    const canvas = q<HTMLCanvasElement>('.im-map');
    const panel = q<HTMLElement>('.im-panel');
    const setup = q<HTMLElement>('.im-setup');
    const renderer = createRenderer(canvas);
    const events = new AbortController();
    const signal = events.signal;
    let campaign = createCampaign(0, 19360101);
    let view: MapView = { selected: null, units: [], mode: 'political', zoom: 1, panX: 0, panY: 0 };
    let activeTab: Tab | null = null;
    let running = false, paused = false, disposed = false, orderMode = false;
    let speed = 1, frame = 0, lastTime = performance.now(), elapsed = 0;
    let targetProvince = 0, targetNation: NationId = 1;
    let noticeTimer: ReturnType<typeof setTimeout> | undefined;
    let renderedConstruction: BuildJob[] = [];
    let selectedSetup: NationId = 0;
    let lastPhase: Campaign['phase'] = 'setup';
    const player = () => campaign.nations[campaign.player];
    const nation = () => NATIONS[campaign.player];
    const ownUnits = () => campaign.divisions.filter(unit => unit.nation === campaign.player);
    const blocked = () => paused || campaign.phase !== 'playing';
    const selected = () => view.selected === null ? null : PROVINCES[view.selected];

    function draw() { frame = 0; if (!disposed) renderer.draw(campaign, view); }
    function invalidate() { if (!frame && !disposed) frame = requestAnimationFrame(draw); }
    function notify(text: string) {
      const notice = q<HTMLElement>('.im-notice'); notice.textContent = text;
      notice.classList.add('is-visible');
      clearTimeout(noticeTimer); noticeTimer = setTimeout(() => notice.classList.remove('is-visible'), 4500);
      context.announce(text);
    }
    function persist() { if (!disposed) context.save(snapshot()); }
    function command(cmd: Command) {
      if (blocked()) return;
      const result = issue(campaign, cmd);
      notify(result.message);
      if (result.ok) { context.sound('tap'); persist(); }
      paint(true); invalidate();
    }
    function reportSelection(province: number, additive = false) {
      view.selected = province; targetProvince = province;
      const owner = campaign.provinces[province].owner;
      if (owner !== campaign.player) targetNation = owner;
      const units = ownUnits().filter(unit => unit.province === province).map(unit => unit.id);
      view.units = additive ? [...new Set([...view.units, ...units])] : units;
      if (!activeTab) activeTab = 'Command';
      paint(true); invalidate();
      context.announce(`${PROVINCES[province].name}, ${NATIONS[owner].name}, ${units.length} of your divisions.`);
    }
    function selectTab(tab: Tab | null) {
      activeTab = activeTab === tab ? null : tab;
      paintPanel(true); paintTabs();
    }
    function paintTabs() {
      root.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(el => {
        el.classList.toggle('is-active', el.dataset.tab === activeTab);
        el.setAttribute('aria-expanded', String(el.dataset.tab === activeTab));
      });
    }
    function title(eyebrow: string, heading: string) {
      return `<div class="im-panel-heading"><div><span class="im-eyebrow">${eyebrow}</span><h2>${heading}</h2></div>${button('×', 'close-panel', 'aria-label="Close panel"', false, 'im-close')}</div>`;
    }
    function stat(label: string, value: string, detail = '') {
      return `<div class="im-stat"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
    }
    function provinceOptions(value: number) {
      return PROVINCES.map(p => `<option value="${p.id}" ${p.id === value ? 'selected' : ''}>${escape(p.name)} · ${escape(NATIONS[campaign.provinces[p.id].owner].short)}</option>`).join('');
    }
    function commandPanel() {
      const n = player(), p = selected();
      const regions = campaign.provinces.filter(s => s.owner === campaign.player).length;
      const vp = PROVINCES.reduce((sum, p) => sum + (campaign.provinces[p.id].owner === campaign.player || n.allies.includes(campaign.provinces[p.id].owner) ? p.vp : 0), 0);
      const totalVP = PROVINCES.reduce((sum, p) => sum + p.vp, 0);
      const capitals = PROVINCES.filter(p => p.capital && (campaign.provinces[p.id].owner === campaign.player || n.allies.includes(campaign.provinces[p.id].owner))).length;
      return title('OPERATIONS ROOM', nation().name) + `<div class="im-objective"><span class="im-eyebrow">CAMPAIGN OBJECTIVE</span><strong>${Math.round(vp / totalVP * 100)}<small>% influence</small></strong>${meter(vp / (totalVP * .6), 'Victory point objective')}<p>Control 60% of victory points · ${capitals}/3 capitals</p></div>
        <div class="im-stat-grid">${stat('Stability', percent(n.stability))}${stat('War support', percent(n.support))}${stat('Divisions', String(ownUnits().length))}${stat('Provinces', String(regions))}</div>
        <div class="im-section-label">PROVINCE INTELLIGENCE</div><label class="im-label">Province<select class="im-province" data-focus="province">${provinceOptions(view.selected ?? PROVINCES.find(p => p.home === campaign.player && p.capital)!.id)}</select></label>
        ${p ? `<div class="im-province-card"><span class="im-eyebrow">${escape(NATIONS[campaign.provinces[p.id].owner].name)}</span><h3>${escape(p.name)}${p.capital ? ' <small>CAPITAL</small>' : ''}</h3><div class="im-stat-grid">${stat('Terrain', p.terrain)}${stat('Victory points', String(p.vp))}${stat('Your supply', percent(supplyAt(campaign, campaign.player, p.id)))}${stat('Infrastructure', String(campaign.provinces[p.id].infrastructure))}</div>${p.port ? '<p class="im-note">Port access</p>' : ''}</div>` : '<p class="im-note">Select a province to inspect it.</p>'}
        <div class="im-section-label">QUICK ORDERS</div><div class="im-action-row">${button('Select army', 'select-all', '', blocked())}${button('Move / attack', 'order-mode', '', blocked() || !view.units.length)}</div><p class="im-note">${orderMode ? 'Choose a destination on the map.' : 'Select divisions, then choose a destination.'}</p>`;
    }
    function forcesPanel() {
      const n = player();
      return title('ARMY COMMAND', 'Armed forces') + `<div class="im-section-label">RECRUIT DIVISIONS</div><div class="im-recruit">${(Object.keys(TEMPLATES) as UnitType[]).map(id => {
        const t = TEMPLATES[id];
        const cost = Object.entries(t.equipment).map(([key, count]) => `${count} ${EQUIPMENT[key as Equipment].name.toLowerCase()}`).join(' · ');
        const affordable = n.manpower >= t.manpower && Object.entries(t.equipment).every(([key, count]) => n.stock[key as Equipment] >= count!);
        return `<div class="im-card-row"><div><strong>${escape(t.name)}</strong><small>${number(t.manpower)} manpower · ${t.days} days</small><small>${escape(cost)}</small></div>${button('Train', 'recruit', `data-unit-type="${id}" aria-label="Train ${escape(t.name)}"`, blocked() || !affordable)}</div>`;
      }).join('')}</div>${n.recruitment.length ? `<div class="im-queue">${n.recruitment.map(job => `<div><span>${escape(TEMPLATES[job.type].name)}</span><small>${Math.floor(job.progress)}/${TEMPLATES[job.type].days} days</small>${meter(job.progress / TEMPLATES[job.type].days, 'Training progress')}</div>`).join('')}</div>` : ''}
        <div class="im-section-label">YOUR DIVISIONS <span>${view.units.length} SELECTED</span></div><div class="im-action-row">${button('Select all', 'select-all', '', blocked())}${button('Hold', 'halt', '', blocked() || !view.units.length)}</div>
        <div class="im-unit-list">${ownUnits().map(unit => `<button type="button" class="im-unit ${view.units.includes(unit.id) ? 'is-selected' : ''}" data-unit="${unit.id}" data-focus="unit-${unit.id}" aria-pressed="${view.units.includes(unit.id)}" ${blocked() ? 'disabled' : ''}><span class="im-counter">${unit.type === 'armored' ? '▰' : '×'}</span><span><strong>${escape(TEMPLATES[unit.type].name)} ${unit.id}</strong><small>${escape(PROVINCES[unit.province].name)}${unit.path.length ? ' · Moving' : ' · Holding'}</small>${meter(unit.org / 100, 'Organization')}</span><b>${Math.round(unit.hp)}%</b></button>`).join('') || '<p class="im-note">No divisions deployed.</p>'}</div>
        <label class="im-label">Destination<select class="im-destination" data-focus="destination">${provinceOptions(targetProvince)}</select></label>${button(`Issue order · ${view.units.length}`, 'issue-order', '', blocked() || !view.units.length, 'im-primary')}
        <div class="im-section-label">AIR & SEA</div><label class="im-label">Air mission<select class="im-air" data-focus="air" ${blocked() ? 'disabled' : ''}>${(['reserve', 'superiority', 'support'] as const).map(v => `<option value="${v}" ${n.airMission === v ? 'selected' : ''}>${{ reserve: 'Reserve', superiority: 'Air superiority', support: 'Close air support' }[v]}</option>`).join('')}</select></label><label class="im-label">Naval mission<select class="im-navy" data-focus="navy" ${blocked() ? 'disabled' : ''}>${(['reserve', 'patrol', 'raiding'] as const).map(v => `<option value="${v}" ${n.navalMission === v ? 'selected' : ''}>${{ reserve: 'In port', patrol: 'Sea patrol', raiding: 'Convoy raiding' }[v]}</option>`).join('')}</select></label><p class="im-note">Missions use equipment and fuel. Patrols enable port crossings.</p>`;
    }
    function industryPanel() {
      const n = player(), i = industry(campaign, campaign.player);
      renderedConstruction = [...n.construction];
      const owned = PROVINCES.filter(p => campaign.provinces[p.id].owner === campaign.player);
      const buildProvince = view.selected !== null && campaign.provinces[view.selected].owner === campaign.player ? view.selected : owned.find(p => p.capital)?.id ?? owned[0]?.id;
      return title('ECONOMIC DIRECTORATE', 'Industry') + `<div class="im-stat-grid">${stat('Civilian', String(i.civilian))}${stat('Military', String(i.military))}${stat('Dockyards', String(i.dockyard))}${stat('Steel / oil', `${i.steel} / ${i.oil}`)}</div><div class="im-section-label">PRODUCTION <span>${availableFactories(campaign, campaign.player)} FACTORIES FREE</span></div>
        ${equipmentIds.map(id => `<div class="im-production"><div class="im-production-top"><strong>${escape(EQUIPMENT[id].name)}</strong><span>${number(n.stock[id])} in stock</span></div><div class="im-production-bottom"><span class="im-note">${percent(n.efficiency[id])} efficiency</span><div class="im-stepper">${button('−', 'allocate', `data-equipment="${id}" data-delta="-1" aria-label="Remove ${escape(EQUIPMENT[id].name)} factory"`, blocked() || n.allocation[id] === 0)}<b>${n.allocation[id]}</b>${button('+', 'allocate', `data-equipment="${id}" data-delta="1" aria-label="Add ${escape(EQUIPMENT[id].name)} factory"`, blocked() || (id === 'ships' ? i.dockyard <= n.allocation.ships : availableFactories(campaign, campaign.player) <= 0))}</div></div>${meter(n.efficiency[id], 'Production efficiency')}</div>`).join('')}
        <div class="im-section-label">CONSTRUCTION</div><label class="im-label">Build in<select class="im-build-province" data-focus="build-province">${owned.map(p => `<option value="${p.id}" ${p.id === buildProvince ? 'selected' : ''}>${escape(p.name)}</option>`).join('')}</select></label><div class="im-build-grid">${(Object.keys(BUILDINGS) as Building[]).map(id => button(escape(BUILDINGS[id].name), 'build', `data-building="${id}" title="${BUILDINGS[id].cost} construction points"`, blocked() || buildProvince === undefined)).join('')}</div>
        ${n.construction.length ? `<ol class="im-queue">${n.construction.map((job, index) => `<li><div><strong>${escape(BUILDINGS[job.kind].name)}</strong><small>${escape(PROVINCES[job.province].name)}</small></div>${button('×', 'cancel-build', `data-index="${index}" aria-label="Cancel ${escape(BUILDINGS[job.kind].name)} in ${escape(PROVINCES[job.province].name)}"`, blocked(), 'im-close')}${meter(job.progress / BUILDINGS[job.kind].cost, 'Construction progress')}</li>`).join('')}</ol>` : '<p class="im-note">Civilian factories work on the first queued project.</p>'}`;
    }
    function researchPanel() {
      const n = player();
      return title('SCIENCE & PLANNING', 'Research') + `<div class="im-section-label">TECHNOLOGY <span>${n.research.length}/2 SLOTS</span></div>
        ${n.research.map(job => { const t = TECHS.find(t => t.id === job.tech)!; return `<div class="im-current"><span class="im-eyebrow">RESEARCHING</span><strong>${escape(t.name)}</strong><small>${Math.floor(job.progress)}/${t.days} days</small>${meter(job.progress / t.days, 'Research progress')}</div>`; }).join('')}
        <div class="im-tech-list">${TECHS.map(t => { const done = n.techs.includes(t.id), busy = n.research.some(job => job.tech === t.id); return `<div class="im-card-row ${done ? 'is-complete' : ''}"><div><small class="im-eyebrow">${escape(t.branch)}</small><strong>${escape(t.name)}</strong><small>${escape(t.description)}</small>${t.requires.length && !done ? `<small>Requires ${escape(t.requires.map(id => TECHS.find(t => t.id === id)?.name ?? id).join(', '))}</small>` : ''}</div>${button(done ? '✓' : busy ? 'Active' : `${t.days}d`, 'research', `data-tech="${t.id}" aria-label="Research ${escape(t.name)}"`, blocked() || !canResearch(campaign, campaign.player, t.id))}</div>`; }).join('')}</div>
        <div class="im-section-label">NATIONAL FOCUS</div>${n.focus ? (() => { const f = FOCUSES.find(f => f.id === n.focus!.id)!; return `<div class="im-current"><span class="im-eyebrow">IN PROGRESS</span><strong>${escape(f.name)}</strong><small>${Math.floor(n.focus!.progress)}/${f.days} days</small>${meter(n.focus!.progress / f.days, 'National focus progress')}</div>`; })() : ''}
        <div class="im-focus-tree">${FOCUSES.map(f => `<div class="im-focus ${n.focuses.includes(f.id) ? 'is-complete' : ''}"><span class="im-eyebrow">${escape(f.branch)}</span><strong>${escape(f.name)}</strong><small>${escape(f.description)}</small>${button(n.focuses.includes(f.id) ? 'Completed' : `${f.days} days`, 'focus', `data-focus-id="${f.id}" aria-label="Begin ${escape(f.name)} focus"`, blocked() || !canFocus(campaign, campaign.player, f.id))}</div>`).join('')}</div>`;
    }
    function statecraftPanel() {
      const n = player(), target = campaign.nations[targetNation], definition = NATIONS[targetNation];
      const war = atWar(campaign, campaign.player, targetNation), allied = n.allies.includes(targetNation);
      const justification = n.justification?.target === targetNation ? Math.max(0, n.justification.readyDay - campaign.day) : null;
      return title('FOREIGN OFFICE', 'Statecraft') + `<div class="im-stat-grid">${stat('Political power', number(n.pp))}${stat('World tension', percent(campaign.tension / 100))}</div><label class="im-label">Nation<select class="im-nation" data-focus="nation">${NATIONS.filter(v => v.id !== campaign.player).map(v => `<option value="${v.id}" ${targetNation === v.id ? 'selected' : ''}>${escape(v.name)}</option>`).join('')}</select></label>
        <div class="im-diplomacy-card" style="--im-nation:${definition.color}"><span class="im-nation-mark">${definition.short.slice(0, 2).toUpperCase()}</span><div><h3>${escape(definition.name)}</h3><span>${target.capitulated ? 'Capitulated' : war ? 'At war' : allied ? 'Allied' : 'At peace'}</span><small>Relations ${Math.round(n.relations[targetNation])}</small></div></div>
        <div class="im-diplomacy-actions">${button('Improve relations <small>20 power</small>', 'relations', '', blocked() || war || target.capitulated)}${button('Form alliance <small>75 power · 40 relations</small>', 'alliance', '', blocked() || war || allied || target.capitulated)}${button(n.trade === targetNation ? 'End trade' : 'Trade resources <small>1 civilian factory</small>', 'trade', '', blocked() || war || target.capitulated)}${justification === null ? button('Justify war <small>35 power ? 24 days</small>', 'justify', '', blocked() || war || allied || target.capitulated) : justification > 0 ? `<div class="im-current"><span class="im-eyebrow">WAR JUSTIFICATION</span><strong>${justification} days remaining</strong></div>` : button('Declare war', 'declare', '', blocked() || war || allied || target.capitulated, 'im-danger')}${button('Plan offensive', 'front', '', blocked() || !war)}</div>
        <div class="im-section-label">HOME FRONT</div><div class="im-action-row">${button('Mobilize', 'mobilize', '', blocked())}${button('Rally support', 'rally', '', blocked())}</div><p class="im-note">Mobilization trades political power and stability for reserves. Rallying restores support.</p>
        <div class="im-section-label">WORLD SITUATION</div>${NATIONS.map(v => `<div class="im-world-row"><i style="background:${v.color}"></i><strong>${escape(v.short)}</strong><span>${campaign.nations[v.id].capitulated ? 'Capitulated' : `${campaign.provinces.filter(p => p.owner === v.id).length} provinces`}</span></div>`).join('')}`;
    }
    function paintPanel(force = false) {
      panel.hidden = !activeTab || campaign.phase === 'setup';
      if (panel.hidden) return;
      const focused = document.activeElement;
      if (!force && focused instanceof HTMLSelectElement && panel.contains(focused)) return;
      const key = focused instanceof HTMLElement && panel.contains(focused) ? focused.dataset.focus : undefined;
      const scroll = panel.scrollTop;
      panel.innerHTML = activeTab === 'Command' ? commandPanel() : activeTab === 'Forces' ? forcesPanel() : activeTab === 'Industry' ? industryPanel() : activeTab === 'Research' ? researchPanel() : statecraftPanel();
      panel.scrollTop = scroll;
      if (key) [...panel.querySelectorAll<HTMLElement>('[data-focus]')].find(el => el.dataset.focus === key)?.focus({ preventScroll: true });
    }
    function paintSetup() {
      setup.hidden = campaign.phase !== 'setup';
      if (setup.hidden) return;
      setup.innerHTML = `<div class="im-setup-card im-glass"><span class="im-eyebrow">A GRAND STRATEGY CAMPAIGN</span><h1>Iron<br><em>Meridian</em></h1><p class="im-setup-intro">Industry builds the army.<br>Strategy decides the war.</p><div class="im-setup-divider"></div><span class="im-eyebrow">CHOOSE YOUR NATION</span><div class="im-nation-picker">${NATIONS.map(n => `<button type="button" data-choose="${n.id}" style="--im-nation:${n.color}" class="${selectedSetup === n.id ? 'is-selected' : ''}" aria-pressed="${selectedSetup === n.id}"><i>${n.short.slice(0, 2).toUpperCase()}</i><span>${escape(n.name.split(' ')[0])}</span></button>`).join('')}</div><h2>${escape(NATIONS[selectedSetup].name)}</h2><p class="im-setup-specialty">${escape(NATIONS[selectedSetup].specialty)}</p>${button('Begin campaign <span>↗</span>', 'begin', '', paused, 'im-primary im-begin')}<small class="im-setup-foot">6 nations · One theater · Your history</small></div><div class="im-map-stamp"><span>STRATEGIC ATLAS</span><strong>1936</strong><i>01 / WESTERN CONTINENT</i></div>`;
    }
    function paintClock() {
      const clock = q<HTMLElement>('.im-clock');
      if (!clock.childElementCount) {
        clock.innerHTML = `<time></time><div>${button('▶', 'run', 'aria-label="Run time" aria-pressed="false"')}${[1, 3, 7].map(value => button(`${value}×`, 'speed', `data-speed="${value}" aria-label="${value} times speed" aria-pressed="false"`)).join('')}${button('›', 'day', 'aria-label="Next day"')}</div>`;
      }
      clock.querySelector('time')!.textContent = date(campaign.day);
      const run = clock.querySelector<HTMLButtonElement>('[data-action=run]')!;
      run.textContent = running ? 'Ⅱ' : '▶';
      run.setAttribute('aria-label', running ? 'Stop time' : 'Run time');
      run.setAttribute('aria-pressed', String(running));
      clock.querySelectorAll<HTMLButtonElement>('button').forEach(el => {
        el.disabled = blocked();
        if (el.dataset.speed) {
          const active = Number(el.dataset.speed) === speed;
          el.classList.toggle('is-active', active); el.setAttribute('aria-pressed', String(active));
        }
      });
    }
    function paint(force = false) {
      const n = player(), i = industry(campaign, campaign.player);
      root.dataset.phase = campaign.phase; root.dataset.day = String(campaign.day);
      root.dataset.paused = String(paused); root.dataset.running = String(running);
      root.dataset.player = String(campaign.player); root.dataset.ordering = String(orderMode);
      root.style.setProperty('--im-player', nation().color);
      q<HTMLElement>('.im-resources').innerHTML = `<span title="Political power">${icon('power')}<b>${number(n.pp)}</b><small>POWER</small></span><span title="Available manpower">${icon('people')}<b>${number(n.manpower)}</b><small>RESERVES</small></span><span title="Fuel stockpile">${icon('fuel')}<b>${number(n.fuel)}</b><small>FUEL</small></span><span class="im-factory-stat" title="Civilian and military factories">${icon('Industry')}<b>${i.civilian + i.military}</b><small>INDUSTRY</small></span>`;
      paintClock();
      q<HTMLElement>('.im-map-caption').textContent = `${view.mode.toUpperCase()} MAP`;
      const feed = campaign.dispatches.slice(0, 3);
      q<HTMLElement>('.im-feed div').innerHTML = feed.map(item => `<p><time>${date(item.day).slice(0, 6)}</time><span>${escape(item.text)}</span></p>`).join('') || `<p><span>${escape(NATIONS[campaign.player].motto)}</span></p>`;
      paintPanel(force); paintTabs();
      if (force || lastPhase !== campaign.phase) paintSetup();
      const end = q<HTMLElement>('.im-end');
      end.hidden = campaign.phase !== 'victory' && campaign.phase !== 'defeat';
      if (!end.hidden) {
        running = false;
        end.innerHTML = `<section class="im-end-card im-glass"><span class="im-eyebrow">CAMPAIGN CONCLUDED</span><h2>${campaign.phase === 'victory' ? 'A new world order' : 'The capital has fallen'}</h2><p>${date(campaign.day)} · ${number(campaign.score)} points</p>${button('New campaign', 'new-campaign', '', paused, 'im-primary')}</section>`;
        if (lastPhase !== campaign.phase) { context.sound(campaign.phase === 'victory' ? 'success' : 'lose'); context.announce(campaign.phase === 'victory' ? 'Campaign victory.' : 'Your nation has capitulated.'); persist(); }
      }
      lastPhase = campaign.phase;
      context.setScore(campaign.score); context.setLevel(date(campaign.day));
      context.setStatus(campaign.phase === 'setup' ? 'Choose your nation' : paused || !running ? 'Planning' : 'Campaign running');
    }
    function newCampaign() {
      campaign = createCampaign(selectedSetup, 19360101); running = false; activeTab = null;
      view = { selected: null, units: [], mode: 'political', zoom: 1, panX: 0, panY: 0 };
      orderMode = false; elapsed = 0; lastTime = performance.now(); lastPhase = 'setup';
      renderer.fit(view); paint(true); persist(); invalidate();
    }
    function step() {
      if (blocked()) return;
      advanceDay(campaign);
      view.units = view.units.filter(id => ownUnits().some(unit => unit.id === id));
      paint(); invalidate();
      if (campaign.day % 7 === 0) persist();
    }
    function snapshot() {
      return { game: 'iron-meridian', version: 1, campaign: serializeCampaign(campaign), view: { ...view, units: [...view.units] }, tab: activeTab, speed };
    }
    root.addEventListener('click', event => {
      const el = (event.target as Element).closest<HTMLButtonElement>('button');
      if (!el || el.disabled) return;
      if (el.dataset.choose !== undefined && !paused) {
        selectedSetup = Number(el.dataset.choose) as NationId; campaign = createCampaign(selectedSetup, 19360101);
        renderer.fit(view, selectedSetup); paint(true); invalidate(); return;
      }
      if (el.dataset.tab) { if (campaign.phase !== 'setup') selectTab(el.dataset.tab as Tab); return; }
      if (el.dataset.unit) {
        const id = Number(el.dataset.unit);
        const unit = campaign.divisions.find(u => u.id === id && u.nation === campaign.player);
        if (!unit) { view.units = view.units.filter(unitId => unitId !== id); paintPanel(true); invalidate(); return; }
        view.units = view.units.includes(id) ? view.units.filter(v => v !== id) : [...view.units, id];
        view.selected = unit.province; paintPanel(true); invalidate(); return;
      }
      const action = el.dataset.action;
      if (action === 'close-panel') { activeTab = null; paintPanel(); paintTabs(); return; }
      if (action === 'zoom-in' || action === 'zoom-out') { view.zoom = Math.max(MIN_ZOOM, Math.min(4, view.zoom * (action === 'zoom-in' ? 1.2 : 1 / 1.2))); invalidate(); return; }
      if (action === 'fit') { renderer.fit(view); invalidate(); return; }
      if (action === 'new-campaign' && !paused) { newCampaign(); return; }
      if (action === 'begin' && !paused) {
        startCampaign(campaign); targetNation = ((campaign.player + 1) % NATIONS.length) as NationId;
        targetProvince = PROVINCES.find(p => p.home === campaign.player && p.capital)!.id;
        view.selected = targetProvince; activeTab = 'Command'; running = false;
        if (root.clientWidth <= 600) { renderer.fit(view, campaign.player); activeTab = null; }
        paint(true); persist(); invalidate(); notify('Campaign ready. Build your nation, then run time.'); return;
      }
      if (blocked()) return;
      if (action === 'run') { running = !running; elapsed = 0; lastTime = performance.now(); paint(); }
      else if (action === 'speed') { speed = Number(el.dataset.speed); paint(); }
      else if (action === 'day') step();
      else if (action === 'select-all') { view.units = ownUnits().map(unit => unit.id); paintPanel(true); invalidate(); }
      else if (action === 'order-mode') { orderMode = !orderMode; notify(orderMode ? 'Choose a destination for the selected divisions.' : 'Order cancelled.'); paint(); }
      else if (action === 'halt') command({ type: 'halt', units: view.units });
      else if (action === 'issue-order') command({ type: 'order', units: view.units, target: targetProvince });
      else if (action === 'allocate') command({ type: 'allocation', equipment: el.dataset.equipment as Equipment, delta: Number(el.dataset.delta) });
      else if (action === 'recruit') command({ type: 'recruit', unit: el.dataset.unitType as UnitType });
      else if (action === 'research') command({ type: 'research', tech: el.dataset.tech! });
      else if (action === 'focus') command({ type: 'focus', focus: el.dataset.focusId! });
      else if (action === 'build') command({ type: 'build', province: Number(q<HTMLSelectElement>('.im-build-province').value), kind: el.dataset.building as Building });
      else if (action === 'cancel-build') {
        const job = renderedConstruction[Number(el.dataset.index)];
        const index = player().construction.indexOf(job);
        if (index < 0) { notify('Project already finished.'); paint(true); }
        else command({ type: 'cancel-build', index });
      }
      else if (action === 'trade') command({ type: 'trade', target: player().trade === targetNation ? null : targetNation });
      else if (action === 'mobilize' || action === 'rally') command({ type: action });
      else if (action === 'relations') command({ type: 'relations', target: targetNation });
      else if (action === 'alliance') command({ type: 'alliance', target: targetNation });
      else if (action === 'justify') command({ type: 'justify', target: targetNation });
      else if (action === 'declare') command({ type: 'declare', target: targetNation });
      else if (action === 'front') command({ type: 'front', target: targetNation });
    }, { signal });
    root.addEventListener('change', event => {
      const el = event.target as HTMLSelectElement;
      if (el.matches('.im-mode')) { view.mode = el.value as MapMode; paint(); invalidate(); }
      else if (el.matches('.im-province')) reportSelection(Number(el.value));
      else if (el.matches('.im-destination')) targetProvince = Number(el.value);
      else if (el.matches('.im-nation')) { targetNation = Number(el.value) as NationId; paintPanel(true); }
      else if (el.matches('.im-build-province')) view.selected = Number(el.value);
      else if (el.matches('.im-air')) command({ type: 'air', mission: el.value as 'reserve' | 'support' | 'superiority' });
      else if (el.matches('.im-navy')) command({ type: 'navy', mission: el.value as 'reserve' | 'patrol' | 'raiding' });
    }, { signal });
    let drag: { id: number; x: number; y: number; startX: number; startY: number; moved: boolean } | null = null;
    canvas.addEventListener('pointerdown', event => {
      if (paused || event.button !== 0) return;
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX, startY: event.clientY, moved: false };
      canvas.setPointerCapture(event.pointerId);
    }, { signal });
    canvas.addEventListener('pointermove', event => {
      if (!drag || drag.id !== event.pointerId) return;
      if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
      if (drag.moved) { view.panX += event.clientX - drag.x; view.panY += event.clientY - drag.y; invalidate(); }
      drag.x = event.clientX; drag.y = event.clientY;
    }, { signal });
    canvas.addEventListener('pointerup', event => {
      if (!drag || drag.id !== event.pointerId) return;
      const moved = drag.moved; drag = null;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      if (moved || paused || campaign.phase !== 'playing') return;
      const rect = canvas.getBoundingClientRect(); const p = renderer.provinceAt(event.clientX - rect.left, event.clientY - rect.top, view);
      if (p === null) return;
      if (orderMode && view.units.length) { command({ type: 'order', units: view.units, target: p }); orderMode = false; paint(); }
      else reportSelection(p, event.shiftKey);
    }, { signal });
    const cancelDrag = () => { drag = null; };
    canvas.addEventListener('pointercancel', cancelDrag, { signal });
    canvas.addEventListener('contextmenu', event => {
      event.preventDefault(); if (blocked() || !view.units.length) return;
      const rect = canvas.getBoundingClientRect(); const p = renderer.provinceAt(event.clientX - rect.left, event.clientY - rect.top, view);
      if (p !== null) command({ type: 'order', units: view.units, target: p });
    }, { signal });
    canvas.addEventListener('wheel', event => {
      event.preventDefault(); if (paused) return;
      view.zoom = Math.max(MIN_ZOOM, Math.min(4, view.zoom * Math.exp(-event.deltaY * .0015))); invalidate();
    }, { signal, passive: false });
    document.addEventListener('keydown', event => {
      if (disposed || paused || campaign.phase !== 'playing' || document.querySelector('dialog[open]') || (event.target instanceof Element && event.target.closest('input,select,textarea,button,[contenteditable=true]'))) return;
      if (event.code === 'Space') { event.preventDefault(); running = !running; elapsed = 0; lastTime = performance.now(); paint(); }
      else if (event.code === 'KeyN') { event.preventDefault(); step(); }
      else if (/^Digit[1-5]$/.test(event.code)) selectTab(tabs[Number(event.code.slice(-1)) - 1]);
      else if (event.key === '+' || event.key === '=') { view.zoom = Math.min(4, view.zoom * 1.2); invalidate(); }
      else if (event.key === '-') { view.zoom = Math.max(MIN_ZOOM, view.zoom / 1.2); invalidate(); }
      else if (event.key.startsWith('Arrow')) { event.preventDefault(); if (event.key === 'ArrowLeft') view.panX += 40; if (event.key === 'ArrowRight') view.panX -= 40; if (event.key === 'ArrowUp') view.panY += 40; if (event.key === 'ArrowDown') view.panY -= 40; invalidate(); }
    }, { signal });
    const timer = setInterval(() => {
      const now = performance.now(); const delta = Math.min(500, now - lastTime); lastTime = now;
      if (disposed || paused || !running || campaign.phase !== 'playing' || document.hidden) { elapsed = 0; return; }
      elapsed += delta;
      const interval = 1400 / speed;
      let days = 0;
      while (elapsed >= interval && days++ < 3 && campaign.phase === 'playing') { elapsed -= interval; step(); }
    }, 100);
    const observer = new ResizeObserver(() => { const rect = root.getBoundingClientRect(); renderer.resize(rect.width, rect.height); invalidate(); });
    observer.observe(root);
    const rect = root.getBoundingClientRect(); renderer.resize(rect.width, rect.height); renderer.fit(view);
    paint(true); invalidate();
    return {
      pause() { paused = true; elapsed = 0; cancelDrag(); paint(true); },
      resume() { paused = false; elapsed = 0; lastTime = performance.now(); paint(true); invalidate(); },
      restart() { newCampaign(); },
      serialize: snapshot,
      restore(data: unknown) {
        if (!data || typeof data !== 'object') return;
        const saved = data as Record<string, unknown>;
        if (saved.game !== 'iron-meridian' || saved.version !== 1) return;
        const restored = restoreCampaign(saved.campaign); if (!restored) return;
        campaign = restored; selectedSetup = campaign.player; running = false; orderMode = false; elapsed = 0;
        activeTab = tabs.includes(saved.tab as Tab) ? saved.tab as Tab : null;
        speed = [1, 3, 7].includes(saved.speed as number) ? saved.speed as number : 1;
        view = { selected: null, units: [], mode: 'political', zoom: 1, panX: 0, panY: 0 };
        if (saved.view && typeof saved.view === 'object') {
          const v = saved.view as Record<string, unknown>;
          if (typeof v.selected === 'number' && Number.isInteger(v.selected) && PROVINCES[v.selected]) view.selected = v.selected;
          if (Array.isArray(v.units)) view.units = [...new Set(v.units.filter((id): id is number => typeof id === 'number' && campaign.divisions.some(u => u.id === id && u.nation === campaign.player)))];
          if (['political', 'terrain', 'supply'].includes(v.mode as string)) view.mode = v.mode as MapMode;
          for (const key of ['zoom', 'panX', 'panY'] as const) if (typeof v[key] === 'number' && Number.isFinite(v[key])) view[key] = Math.max(key === 'zoom' ? MIN_ZOOM : -5000, Math.min(key === 'zoom' ? 4 : 5000, v[key] as number));
        }
        targetProvince = view.selected ?? PROVINCES.find(p => p.home === campaign.player && p.capital)!.id;
        targetNation = ((campaign.player + 1) % NATIONS.length) as NationId;
        q<HTMLSelectElement>('.im-mode').value = view.mode;
        paint(true); invalidate();
      },
      dispose() {
        disposed = true; events.abort(); observer.disconnect(); clearInterval(timer); clearTimeout(noticeTimer);
        if (frame) cancelAnimationFrame(frame); renderer.dispose(); root.remove();
      },
    };
  },
};
export default game;
