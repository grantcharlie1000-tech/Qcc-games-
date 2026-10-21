import type {GameContext, GameInstance, GameModule} from '../../core/types';
import {
  BAND_LABEL, applyGuess, aucklandDate, band, createState, distanceKm, evaluate, guessColour, legend, liveStreak, nameOf,
  mergeState, newPractice, proximity, refreshDaily, restoreState, serializeState, type GameState, type Mode
} from './model';
import {GlobeView} from './globe';
import './style.css';

const km = (value: number) => `${value.toLocaleString('en-NZ')} km`;
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);

function mount(container: HTMLElement, context: GameContext): GameInstance {
  const root = document.createElement('div');
  root.className = 'globle';
  root.innerHTML = `
    <div class="gl-top">
      <div class="gl-modes" role="group" aria-label="Puzzle type">
        <button type="button" class="gl-mode" data-mode="daily" aria-pressed="true">Daily</button>
        <button type="button" class="gl-mode" data-mode="practice" aria-pressed="false">Practice</button>
      </div>
      <form class="gl-form" novalidate>
        <label class="sr-only" for="gl-input">Country name</label>
        <input id="gl-input" class="gl-input" type="text" name="country" autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" enterkeyhint="go" placeholder="Type a country…" maxlength="60">
        <button type="submit" class="game-button gl-submit">Guess</button>
      </form>
    </div>
    <p class="gl-message" data-tone="info"></p>
    <div class="gl-main">
      <div class="gl-globe-wrap">
        <div class="gl-globe" tabindex="0" role="application" aria-roledescription="globe" aria-label="Globe. Drag to spin, scroll or pinch to zoom. With the globe focused, arrow keys spin it and plus or minus zoom."></div>
        <p class="gl-chip" hidden></p>
        <p class="gl-hint" aria-hidden="true">Drag to spin · scroll or pinch to zoom</p>
      </div>
      <aside class="gl-side" aria-label="Your guesses">
        <div class="gl-summary"><span class="gl-round"></span><span><strong class="gl-count">0</strong> <span class="gl-count-label">guesses</span></span><span>Closest <strong class="gl-closest">–</strong></span></div>
        <section class="gl-win" hidden><h2 class="gl-win-title">Found it!</h2><p class="gl-win-text"></p><button type="button" class="game-button gl-again">Play again</button></section>
        <ol class="gl-history" aria-label="Guesses, closest first"></ol>
        <p class="gl-empty">Guess any country. Each guess is coloured by how close its land is to the hidden country.</p>
        <ul class="gl-legend" aria-label="Colour key"></ul>
        <details class="gl-more"><summary>Stats and options</summary>
          <dl class="gl-stats"></dl>
          <label class="gl-option"><input type="checkbox" class="gl-cb"> Colour-blind palette</label>
        </details>
      </aside>
    </div>`;
  container.append(root);

  const $ = <T extends Element>(selector: string) => root.querySelector<T>(selector)!;
  const form = $<HTMLFormElement>('.gl-form'), input = $<HTMLInputElement>('.gl-input'), message = $<HTMLElement>('.gl-message');
  const history = $<HTMLOListElement>('.gl-history'), empty = $<HTMLElement>('.gl-empty'), win = $<HTMLElement>('.gl-win');
  const chip = $<HTMLElement>('.gl-chip'), globeHost = $<HTMLElement>('.gl-globe'), colourBox = $<HTMLInputElement>('.gl-cb');
  const abort = new AbortController(), signal = abort.signal;
  let today = aucklandDate();
  let state: GameState = createState(today);
  let paused = false, disposed = false, globe: GlobeView | undefined;

  const colourBlind = () => state.colorBlind ?? context.settings.colorBlind;
  const round = () => state[state.mode];
  function lost() {
    globe?.dispose(); globe = undefined;
    root.querySelector('.gl-globe-wrap')!.innerHTML = '<p class="gl-fallback" role="status">The 3D globe isn’t available on this device, but you can keep playing: the list still shows every guess and its distance.</p>';
  }
  try { globe = new GlobeView(globeHost, () => context.settings.reducedMotion, lost); }
  catch { lost(); }

  function say(text: string, tone: 'info' | 'error' | 'win' = 'info') {
    message.textContent = text; message.dataset.tone = tone;
    if (text) context.announce(text);
  }
  function persist() { context.save(serializeState(state)); }

  function render(fly = false) {
    const r = round(), cb = colourBlind();
    root.dataset.mode = state.mode; root.dataset.won = String(r.won); root.dataset.guesses = String(r.guesses.length);
    for (const button of root.querySelectorAll<HTMLButtonElement>('.gl-mode')) button.setAttribute('aria-pressed', String(button.dataset.mode === state.mode));
    $('.gl-round').textContent = state.mode === 'daily' ? `Daily #${r.puzzle}` : 'Practice';
    $('.gl-count').textContent = String(r.guesses.length);
    $('.gl-count-label').textContent = r.guesses.length === 1 ? 'guess' : 'guesses';
    const wrong = r.guesses.filter(id => id !== r.answer);
    const closest = wrong.length ? Math.min(...wrong.map(id => distanceKm(id, r.answer))) : undefined;
    $('.gl-closest').textContent = r.won ? '0 km ✓' : closest === undefined ? '–' : km(closest);
    const ordered = r.guesses.map((id, i) => ({id, n: i + 1, km: distanceKm(id, r.answer)}))
      .sort((a, b) => Number(b.id === r.answer) - Number(a.id === r.answer) || a.km - b.km || b.n - a.n);
    const latest = r.guesses[r.guesses.length - 1];
    history.innerHTML = ordered.map(g => {
      const b = band(g.id, r.answer);
      return `<li class="gl-guess" data-id="${g.id}" data-band="${b}"${g.id === latest ? ' data-latest="true"' : ''}>
        <span class="gl-swatch" style="background:${guessColour(g.id, r.answer, cb)}" aria-hidden="true"></span>
        <span class="gl-name">${escapeHtml(nameOf(g.id))}</span>
        <span class="gl-km">${g.id === r.answer ? 'Correct' : km(g.km)}</span>
        <span class="gl-band">${BAND_LABEL[b]}${g.id === r.answer ? '' : ` · ${proximity(g.km)}%`} · #${g.n}</span>
      </li>`;
    }).join('');
    empty.hidden = r.guesses.length > 0;
    $('.gl-legend').innerHTML = legend(cb).map(item => `<li><span class="gl-swatch" style="background:${item.colour}" aria-hidden="true"></span>${item.label}</li>`).join('');
    win.hidden = !r.won;
    if (r.won) {
      const n = r.guesses.length;
      $('.gl-win-text').textContent = `It’s ${nameOf(r.answer)}. You found it in ${n} ${n === 1 ? 'guess' : 'guesses'}.` +
        (state.mode === 'daily' ? ` Daily streak: ${liveStreak(state.stats.daily, today)}. A new daily puzzle arrives at midnight New Zealand time.` : '');
      $('.gl-again').textContent = state.mode === 'daily' ? 'Play a practice round' : 'Play again';
    }
    input.disabled = r.won; $<HTMLButtonElement>('.gl-submit').disabled = r.won;
    input.placeholder = r.won ? 'Solved!' : 'Type a country…';
    colourBox.checked = cb;
    renderStats();
    if (latest) {
      chip.hidden = false;
      chip.textContent = latest === r.answer ? `${nameOf(latest)} · correct` : `${nameOf(latest)} · ${km(distanceKm(latest, r.answer))}`;
    } else chip.hidden = true;
    globe?.show(r.guesses.map(id => ({id, colour: guessColour(id, r.answer, cb)})));
    if (fly && latest) globe?.flyTo(latest);
    context.setStatus(`${state.mode === 'daily' ? `Daily #${r.puzzle}` : 'Practice'} · ${r.guesses.length} ${r.guesses.length === 1 ? 'guess' : 'guesses'}${r.won ? ' · solved' : ''}`);
  }
  function renderStats() {
    const d = state.stats.daily, p = state.stats.practice;
    const rows: [string, string][] = [
      ['Daily streak', String(liveStreak(d, today))], ['Best streak', String(d.maxStreak)], ['Daily wins', `${d.wins} of ${d.played}`],
      ['Daily average', d.wins ? (d.totalGuesses / d.wins).toFixed(1) : '–'],
      ['Practice wins', `${p.wins} of ${p.played}`], ['Practice average', p.wins ? (p.totalGuesses / p.wins).toFixed(1) : '–'], ['Practice best', p.best === null ? '–' : String(p.best)]
    ];
    $('.gl-stats').innerHTML = rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  }

  function checkDate(): boolean {
    const now = aucklandDate();
    if (now === today) return false;
    today = now;
    if (refreshDaily(state, today)) {
      persist();
      if (state.mode === 'daily') {render(); say(`A new daily puzzle has started for ${today}.`);}
      else renderStats();
      return true;
    }
    return false;
  }

  function submit(value = input.value) {
    if (paused || disposed) return;
    // Don't let a guess typed for yesterday's puzzle land on the new one.
    if (checkDate() && state.mode === 'daily') return;
    const typed = value;
    const outcome = evaluate(round(), typed);
    if (outcome.kind !== 'guess') {
      say(outcome.message, outcome.kind === 'finished' ? 'info' : 'error');
      if (outcome.kind === 'unknown' && outcome.suggestion) {
        const country = nameOf(outcome.suggestion);
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'gl-correction';
        button.textContent = country;
        // The model ends its suggestion with the country name and a question mark.
        message.replaceChildren(document.createTextNode(outcome.message.slice(0, -country.length - 1)), button, '?');
        button.addEventListener('click', () => {
          submit(country);
          if (!round().won) input.focus({preventScroll: true});
        }, {signal});
      }
      input.select();
      return;
    }
    applyGuess(state, outcome.id);
    input.value = '';
    persist();
    if (outcome.correct) {
      const n = round().guesses.length;
      say(`Correct! It’s ${nameOf(outcome.id)}, found in ${n} ${n === 1 ? 'guess' : 'guesses'}.`, 'win');
      context.sound('success');
    } else {
      const b = band(outcome.id, round().answer);
      say(`${nameOf(outcome.id)}: ${outcome.km === 0 ? 'shares a border with the hidden country (0 km), but it isn’t the answer.' : `${km(outcome.km)} away · ${BAND_LABEL[b].toLowerCase()}.`}`);
      context.sound('tap');
    }
    render(true);
    if (round().won) $<HTMLButtonElement>('.gl-again').focus({preventScroll: true});
  }
  form.addEventListener('submit', event => {event.preventDefault(); submit();}, {signal});

  function setMode(mode: Mode) {
    if (state.mode === mode) return;
    checkDate();
    state.mode = mode;
    persist(); say(''); render(true);
    if (!round().won) input.focus({preventScroll: true});
  }
  for (const button of root.querySelectorAll<HTMLButtonElement>('.gl-mode')) button.addEventListener('click', () => setMode(button.dataset.mode as Mode), {signal});

  function newRound() {
    state.practice = newPractice(Math.random, state.practice.answer);
    state.mode = 'practice';
    persist(); render(true);
  }
  $('.gl-again').addEventListener('click', () => {
    newRound(); say('New practice round. A different country is hidden.');
    input.focus({preventScroll: true});
  }, {signal});
  colourBox.addEventListener('change', () => {state.colorBlind = colourBox.checked; persist(); render();}, {signal});

  // Keep the input usable when an on-screen keyboard shrinks the visual viewport.
  const viewport = window.visualViewport;
  function keyboard() {
    if (!viewport || disposed) return;
    const top = root.getBoundingClientRect().top;
    const open = document.activeElement === input && viewport.height < window.innerHeight - 100;
    root.classList.toggle('gl-keyboard', open);
    root.style.setProperty('--gl-available', `${Math.max(160, Math.round(viewport.height + viewport.offsetTop - top))}px`);
    if (open && viewport.offsetTop > 0) window.scrollTo(0, 0);
  }
  viewport?.addEventListener('resize', keyboard, {signal});
  input.addEventListener('focus', keyboard, {signal});
  input.addEventListener('blur', () => setTimeout(keyboard, 50), {signal});

  const clock = window.setInterval(() => {if (!paused) checkDate();}, 30000);

  // Another tab saved Globle: fold its progress in, so an old tab's autosave can never
  // overwrite a newer result. The merge only moves forward, so tabs converge.
  window.addEventListener('storage', event => {
    if (disposed || !event.key?.endsWith(':save:globle') || !event.newValue) return;
    let incoming: GameState | undefined;
    try { incoming = restoreState((JSON.parse(event.newValue) as {data?: unknown}).data, aucklandDate()); } catch { return; }
    if (!incoming) return;
    const merged = mergeState(state, incoming);
    if (JSON.stringify(merged) === JSON.stringify(state)) return;
    state = merged; today = aucklandDate();
    render(); persist();
  }, {signal});
  render();

  return {
    pause() {paused = true; globe?.pause();},
    resume() {paused = false; checkDate(); render(); globe?.resume();},
    restart() {
      // The shared daily answer cannot be re-rolled; restart begins a fresh practice round.
      const fromDaily = state.mode === 'daily';
      newRound();
      say(fromDaily ? 'Today’s daily puzzle is kept. Here is a fresh practice round.' : 'New practice round. A different country is hidden.');
    },
    serialize: () => serializeState(state),
    restore(data) {
      const restored = restoreState(data, aucklandDate());
      if (!restored) return;
      state = restored; today = aucklandDate();
      render();
      const latest = round().guesses[round().guesses.length - 1];
      if (latest) globe?.flyTo(latest);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearInterval(clock);
      abort.abort();
      globe?.dispose(); globe = undefined;
      root.remove();
    }
  };
}

const game: GameModule = {
  id: 'globle',
  title: 'Globle',
  cover: 'game-art/globle/cover.svg',
  rules: 'Find the hidden country. Type any country and press Enter or Guess. Each wrong guess is coloured on the globe by how close its land is to the hidden country’s land: pale cream is far away, orange is closer, red is very close and dark red means the two countries share a border. Bordering countries are 0 km away but are still wrong. The list shows every guess with its distance in kilometres and a closeness percentage. Drag the globe to spin it and scroll or pinch to zoom. Guesses are unlimited, so aim for as few as possible. The daily puzzle is the same for everyone and changes at midnight New Zealand time; practice rounds are unlimited. Restart starts a new practice round and never resets the daily puzzle.',
  mount
};
export default game;
