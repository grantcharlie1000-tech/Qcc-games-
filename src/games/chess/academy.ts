import { BoardView } from './board';
import { ACADEMY_GROUPS, ACADEMY_LESSONS, academyStart, type AcademyLesson } from './academy-data';
import { esc, ico } from './dom';
import type { ChessRules, Piece } from './rules';
import type { Prefs } from './screen';

export interface AcademyProgress {
  readonly completed: Record<string, number>;
}

/** The shell may restore snapshots from older versions or untrusted storage. */
export function restoreAcademyProgress(data: unknown): AcademyProgress {
  const completed: Record<string, number> = Object.create(null);
  if (!data || typeof data !== 'object') return { completed };
  const input = (data as { completed?: unknown }).completed;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { completed };
  for (const lesson of ACADEMY_LESSONS) {
    const stars = (input as Record<string, unknown>)[lesson.id];
    if (Number.isInteger(stars) && Number(stars) >= 1 && Number(stars) <= 3) completed[lesson.id] = Number(stars);
  }
  return { completed };
}

interface AcademyHost {
  readonly root: HTMLElement;
  progress: AcademyProgress;
  prefs(): Prefs;
  reducedMotion(): boolean;
  announce(text: string): void;
  onProgress(progress: AcademyProgress): void;
  onExit(): void;
}

const STARS = (n: number) => '★'.repeat(n) + '☆'.repeat(3 - n);
const FILES = 'abcdefgh';

export class ChessAcademy {
  private board?: BoardView;
  private rules?: ChessRules;
  private lesson?: AcademyLesson;
  private step = 0;
  private mistakes = 0;
  private hintUsed = false;
  private feedback = '';
  private filter: 'all' | 'review' = 'all';

  constructor(private readonly host: AcademyHost) {
    host.root.addEventListener('click', this.click);
    this.catalog();
  }

  dispose(): void {
    this.host.root.removeEventListener('click', this.click);
    this.board?.dispose();
    this.board = undefined;
  }

  private readonly click = (event: Event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>('[data-academy]');
    if (!target || !this.host.root.contains(target)) return;
    const action = target.dataset.academy;
    if (action === 'exit') this.host.onExit();
    else if (action === 'catalog') this.catalog();
    else if (action === 'open') this.open(target.dataset.lesson ?? '');
    else if (action === 'continue') {
      const next = ACADEMY_LESSONS.find((l) => !this.host.progress.completed[l.id]) ?? ACADEMY_LESSONS[0];
      this.open(next.id);
    } else if (action === 'filter') {
      this.filter = this.filter === 'all' ? 'review' : 'all';
      this.catalog();
    } else if (action === 'hint') this.hint();
    else if (action === 'retry' && this.lesson) this.open(this.lesson.id);
    else if (action === 'next' && this.lesson && this.done) {
      const index = ACADEMY_LESSONS.indexOf(this.lesson);
      if (index + 1 < ACADEMY_LESSONS.length) this.open(ACADEMY_LESSONS[index + 1].id);
      else this.catalog();
    }
  };

  private get done() { return !!this.lesson && this.step === this.lesson.steps.length; }
  private get completedCount() { return ACADEMY_LESSONS.filter((l) => !!this.host.progress.completed[l.id]).length; }

  private catalog(): void {
    this.board?.dispose();
    this.board = undefined;
    this.lesson = undefined;
    const done = this.completedCount, count = ACADEMY_LESSONS.length;
    const next = ACADEMY_LESSONS.find((l) => !this.host.progress.completed[l.id]);
    const visible = this.filter === 'all'
      ? ACADEMY_LESSONS
      : ACADEMY_LESSONS.filter((l) => this.host.progress.completed[l.id] && this.host.progress.completed[l.id] < 3);
    this.host.root.innerHTML = `
      <header class="ch-head"><button type="button" class="ch-iconbtn" data-academy="exit" aria-label="Back to Chess">${ico('back')}</button><h1 tabindex="-1">Chess Academy</h1></header>
      <section class="ch-academy-content">
        <div class="ch-academy-hero">
          <p class="ch-academy-kicker">Learn by playing</p>
          <h2>Think. Move. Improve.</h2>
          <p>Quick, interactive lessons on the same chessboard you play on.</p>
          <div class="ch-academy-progress"><span>${done} of ${count} lessons</span><span>${Math.round(done / count * 100)}%</span></div>
          <div class="ch-academy-meter" role="progressbar" aria-label="Academy completion" aria-valuenow="${done}" aria-valuemin="0" aria-valuemax="${count}"><i style="width:${done / count * 100}%"></i></div>
          <button type="button" class="ch-primary" data-academy="continue">${next ? 'Continue learning' : 'Practise again'}</button>
        </div>
        <div class="ch-academy-toolbar"><b>Lessons</b><button type="button" class="ch-pill" data-academy="filter" aria-pressed="${this.filter === 'review'}">${this.filter === 'review' ? 'Show all' : 'Review weak spots'}</button></div>
        ${ACADEMY_GROUPS.map((group) => {
          const entries = visible.filter((lesson) => lesson.group === group);
          if (!entries.length) return '';
          return `<section class="ch-academy-unit"><h2>${esc(group)}</h2><div class="ch-academy-list">${entries.map((lesson) => {
            const stars = this.host.progress.completed[lesson.id] ?? 0;
            const n = ACADEMY_LESSONS.indexOf(lesson) + 1;
            return `<button type="button" class="ch-academy-card" data-academy="open" data-lesson="${esc(lesson.id)}">
              <span class="ch-academy-number">${n}</span>
              <span class="ch-academy-cardtext"><b>${esc(lesson.title)}</b><small>${esc(lesson.intro)}</small></span>
              <span class="ch-academy-stars" aria-label="${stars ? stars + ' of 3 stars' : 'Not completed'}">${stars ? STARS(stars) : '›'}</span>
            </button>`;
          }).join('')}</div></section>`;
        }).join('')}
        ${this.filter === 'review' && !visible.length ? '<p class="ch-note">No weak spots yet. Keep learning or replay a lesson to improve your score.</p>' : ''}
      </section>`;
    this.host.root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  private open(id: string): void {
    const lesson = ACADEMY_LESSONS.find((item) => item.id === id);
    if (!lesson) return;
    this.board?.dispose();
    this.lesson = lesson;
    this.rules = academyStart(lesson);
    this.step = 0;
    this.mistakes = 0;
    this.hintUsed = false;
    this.feedback = '';
    const color = this.rules.turn;
    this.host.root.innerHTML = `
      <header class="ch-head"><button type="button" class="ch-iconbtn" data-academy="catalog" aria-label="Back to lessons">${ico('back')}</button><h1 tabindex="-1">${esc(lesson.title)}</h1></header>
      <section class="ch-academy-content ch-academy-play">
        <div class="ch-academy-lessonhead">
          <div class="ch-academy-meta"><span>${esc(lesson.group)}</span><span class="ch-academy-count"></span></div>
          <h2>${esc(lesson.intro)}</h2>
          <p class="ch-academy-objective"></p>
        </div>
        <div class="ch-academy-boardwrap" aria-label="Practice chessboard"></div>
        <p class="ch-academy-feedback" role="status" aria-live="polite"></p>
        <div class="ch-academy-controls">
          <button type="button" class="ch-pill" data-academy="hint">Hint</button>
          <button type="button" class="ch-pill" data-academy="retry">Retry</button>
          <button type="button" class="ch-pill ch-pill-primary" data-academy="next" hidden>Next lesson</button>
        </div>
        <p class="ch-muted ch-fine ch-academy-footnote">Play as ${color === 'w' ? 'White' : 'Black'}. Tap or drag pieces. Legal moves are highlighted.</p>
      </section>`;
    this.board = new BoardView({
      legalFrom: (square) => !this.done ? this.rules!.legalFrom(square) : [],
      premoveFrom: () => [],
      mover: () => !this.done ? this.rules!.turn : null,
      turn: () => this.rules!.turn,
      onMove: (move) => this.move(move),
      onPremove: () => {},
      announce: (message) => this.host.announce(message),
    });
    this.board.setOrientation(color);
    this.board.setCoordinates(true);
    this.board.setHints(true);
    this.host.root.querySelector('.ch-academy-boardwrap')!.append(this.board.root);
    this.paintBoard(false);
    this.updateText();
    this.host.root.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }

  private move(uci: string): boolean {
    const rules = this.rules, lesson = this.lesson;
    if (!rules || !lesson || this.done) return false;
    const step = lesson.steps[this.step];
    if (uci !== step.move) {
      this.mistakes++;
      this.feedback = 'That move is legal, but it does not meet this lesson\'s goal. Try again.';
      this.updateText();
      return false;
    }
    if (!rules.move(uci)) return false;
    if (step.reply && !rules.move(step.reply)) throw new Error('Invalid academy reply: ' + lesson.id);
    this.step++;
    this.board?.setGuide(null);
    this.feedback = step.why;
    if (this.done) {
      const stars = Math.max(1, 3 - Math.min(2, this.mistakes + Number(this.hintUsed)));
      const completed = { ...this.host.progress.completed, [lesson.id]: Math.max(stars, this.host.progress.completed[lesson.id] ?? 0) };
      this.host.progress = { completed };
      this.host.onProgress(this.host.progress);
      this.feedback = 'Lesson complete. ' + STARS(stars) + '  ' + step.why;
      this.host.announce('Lesson complete. ' + stars + ' stars.');
    } else this.host.announce(step.why);
    this.paintBoard(!this.host.reducedMotion());
    this.updateText();
    return true;
  }

  private hint(): void {
    if (!this.lesson || this.done) return;
    const step = this.lesson.steps[this.step];
    this.hintUsed = true;
    this.feedback = step.hint;
    this.board?.setGuide(step.move);
    this.updateText();
    this.host.announce(step.hint);
  }

  private paintBoard(animate: boolean): void {
    if (!this.rules || !this.board) return;
    const pieces = new Map<string, Piece>();
    this.rules.board().forEach((rank, y) => rank.forEach((piece, x) => {
      if (piece) pieces.set(FILES[x] + String(8 - y), piece);
    }));
    const last = this.rules.history[this.rules.history.length - 1];
    this.board.setPosition({
      pieces,
      ...(last ? { lastMove: { from: last.from, to: last.to } } : {}),
      ...(this.rules.inCheck() ? { check: this.rules.kingSquare(this.rules.turn) } : {}),
    }, animate);
  }

  private updateText(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const step = lesson.steps[this.step];
    const count = this.host.root.querySelector<HTMLElement>('.ch-academy-count');
    if (count) count.textContent = this.done ? 'Complete' : 'Move ' + (this.step + 1) + ' of ' + lesson.steps.length;
    const prompt = this.host.root.querySelector<HTMLElement>('.ch-academy-objective');
    if (prompt) prompt.textContent = this.done ? 'Great work. You finished this lesson.' : step.prompt;
    const feedback = this.host.root.querySelector<HTMLElement>('.ch-academy-feedback');
    if (feedback) {
      feedback.textContent = this.feedback || 'Find the move on the board.';
      feedback.dataset.kind = this.done ? 'success' : this.feedback ? 'active' : 'idle';
    }
    const hint = this.host.root.querySelector<HTMLButtonElement>('[data-academy="hint"]');
    if (hint) hint.hidden = this.done;
    const next = this.host.root.querySelector<HTMLButtonElement>('[data-academy="next"]');
    if (next) {
      next.hidden = !this.done;
      next.textContent = ACADEMY_LESSONS[ACADEMY_LESSONS.length - 1] === lesson ? 'All lessons' : 'Next lesson';
    }
  }
}
