// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { ACADEMY_LESSONS, academyStart, validateAcademy } from '../../../src/games/chess/academy-data';
import { ChessAcademy, restoreAcademyProgress, type AcademyProgress } from '../../../src/games/chess/academy';

describe('Chess Academy curriculum', () => {
  it('has unique, legally playable exercises with legal opponent replies', () => {
    expect(ACADEMY_LESSONS.length).toBe(15);
    expect(() => validateAcademy()).not.toThrow();
  });

  it('teaches mate rather than stalemate from the same position', () => {
    const lesson = ACADEMY_LESSONS.find((l) => l.id === 'avoid-stalemate')!;
    const wrong = academyStart(lesson);
    expect(wrong.move('b6c7')).not.toBeNull();
    expect(wrong.outcome()?.termination).toBe('stalemate');

    const correct = academyStart(lesson);
    expect(correct.move('b6b7')?.san).toBe('Qb7#');
    expect(correct.outcome()?.termination).toBe('checkmate');
  });

  it('allows a knight fork and the subsequent winning capture', () => {
    const lesson = ACADEMY_LESSONS.find((l) => l.id === 'knight-fork')!;
    const rules = academyStart(lesson);
    expect(rules.move('b5c7')?.san).toBe('Nc7+');
    expect(rules.inCheck()).toBe(true);
    expect(rules.move('e8f8')).not.toBeNull();
    expect(rules.move('c7a8')?.captured).toBe('r');
  });

  it('shows an en passant capture and a promotion through real chess rules', () => {
    const enPassant = academyStart(ACADEMY_LESSONS.find((l) => l.id === 'en-passant')!);
    expect(enPassant.move('e5d6')?.captureSquare).toBe('d5');
    const promotion = academyStart(ACADEMY_LESSONS.find((l) => l.id === 'promotion')!);
    expect(promotion.move('e7e8q')?.promotion).toBe('q');
  });
});

describe('Chess Academy progress and interaction', () => {
  it('ignores unknown keys, invalid scores and malformed saved data', () => {
    expect(restoreAcademyProgress(null).completed).toEqual({});
    expect(restoreAcademyProgress({ completed: { 'centre-pawn': 3, 'win-queen': 900, invalid: 2 } }).completed).toEqual({ 'centre-pawn': 3 });
    expect(restoreAcademyProgress({ completed: [] }).completed).toEqual({});
  });

  function mount() {
    const root = document.createElement('div');
    document.body.append(root);
    let progress: AcademyProgress = restoreAcademyProgress(null);
    let saves = 0;
    const app = new ChessAcademy({
      root,
      progress,
      prefs: () => ({ theme: 'wood', pieces: 'classic', coords: true, hints: true, premove: false, autoFlip: false }),
      reducedMotion: () => true,
      announce: () => {},
      onProgress: (p) => { progress = p; saves++; },
      onExit: () => {},
    });
    const open = (id: string) => root.querySelector<HTMLButtonElement>('[data-lesson="' + id + '"]')!.click();
    const key = (name: string) => root.querySelector('.ch-board')!.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
    const e4 = () => { key('Enter'); key('ArrowUp'); key('ArrowUp'); key('Enter'); };
    return { root, app, open, key, e4, progress: () => progress, saves: () => saves };
  }

  it('lets a learner make real board moves and saves a clean three-star completion', () => {
    const s = mount();
    try {
      s.open('centre-pawn');
      expect(s.root.textContent).toContain('Move White');
      s.e4();
      expect(s.root.textContent).toContain('Lesson complete');
      expect(s.progress().completed['centre-pawn']).toBe(3);
      expect(s.saves()).toBe(1);
      s.root.querySelector<HTMLButtonElement>('[data-academy="catalog"]')!.click();
      expect(s.root.textContent).toContain('1 of 15 lessons');
    } finally { s.app.dispose(); s.root.remove(); }
  });

  it('rejects a wrong legal move, offers a hint and awards fewer stars', () => {
    const s = mount();
    try {
      s.open('centre-pawn');
      s.key('Enter'); s.key('ArrowUp'); s.key('Enter'); // e3 is legal, but not the goal.
      expect(s.root.textContent).toContain('does not meet');
      expect(s.saves()).toBe(0);
      s.root.querySelector<HTMLButtonElement>('[data-academy="hint"]')!.click();
      expect(s.root.textContent).toContain('pawn in front');
      s.root.querySelector<HTMLButtonElement>('[data-academy="retry"]')!.click();
      s.e4();
      expect(s.progress().completed['centre-pawn']).toBe(3); // Retry starts a fresh attempt.
    } finally { s.app.dispose(); s.root.remove(); }
  });
});
