import { ChessAIError, type ChessAIAnalysisSession, type ChessAIRegistry } from '../../chess-ai';
import { ChessRules } from './rules';

/**
 * Post-game analysis through the optional analysis provider. Every number shown
 * comes from the engine; nothing is estimated when no engine is installed.
 */
export interface PlyEval { readonly cp?: number; readonly mate?: number; readonly best?: string; readonly line?: readonly string[] }
export type Judgement = 'inaccuracy' | 'mistake' | 'blunder';

/** White's winning chances (0..100) for an evaluation, using the common logistic mapping. */
export function winChance(e: PlyEval): number {
  if (e.mate !== undefined) return e.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, e.cp ?? 0));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** Judges the move that led from `before` to `after`, from the mover's side. */
export function judge(before: PlyEval, after: PlyEval, mover: 'w' | 'b'): Judgement | null {
  const sign = mover === 'w' ? 1 : -1;
  const drop = sign * (winChance(before) - winChance(after));
  return drop >= 30 ? 'blunder' : drop >= 20 ? 'mistake' : drop >= 10 ? 'inaccuracy' : null;
}

export class GameAnalysis {
  readonly evals: (PlyEval | undefined)[] = [];
  private session?: ChessAIAnalysisSession;
  private abort = new AbortController();
  running = false;
  error = '';
  progress = 0;
  onChange?: () => void;

  constructor(private readonly registry: ChessAIRegistry, private readonly startFen: string, private readonly moves: readonly string[]) {}

  get available() { return !!this.registry.analysisProvider(); }
  get engineName() { return this.registry.analysisProvider()?.name ?? ''; }
  get done() { return this.evals.length === this.moves.length + 1 && this.evals.every(Boolean); }

  async run(thinkingTimeMs = 250) {
    if (this.running || !this.available) return;
    this.running = true;
    this.error = '';
    this.changed();
    try {
      this.session ??= await this.registry.openAnalysis({ signal: this.abort.signal });
      const rules = new ChessRules(this.startFen);
      for (let ply = 0; ply <= this.moves.length; ply++) {
        if (ply > 0) rules.move(this.moves[ply - 1]);
        if (this.evals[ply]) continue;
        const outcome = rules.outcome();
        if (outcome) {
          // A finished position needs no search: mate or a dead draw.
          this.evals[ply] = outcome.termination === 'checkmate' ? { mate: outcome.winner === 'w' ? 1 : -1 } : { cp: 0 };
        } else {
          const r = await this.session.analyze({ fen: rules.fen, startFen: this.startFen, moveHistoryUci: rules.historyUci, legalMovesUci: rules.legalMovesUci(), positionRevision: ply, thinkingTimeMs, multiPv: 1, signal: this.abort.signal });
          const best = r.lines[0];
          this.evals[ply] = best ? { cp: best.evaluationCp, mate: best.mateIn, best: best.pvUci[0], line: best.pvUci } : { cp: 0 };
        }
        this.progress = (ply + 1) / (this.moves.length + 1);
        this.changed();
      }
    } catch (e) {
      if (!(e instanceof ChessAIError && (e.code === 'aborted' || e.code === 'disposed'))) this.error = e instanceof Error ? e.message : 'Analysis failed.';
    } finally {
      this.running = false;
      this.changed();
    }
  }

  judgement(ply: number): Judgement | null {
    const before = this.evals[ply - 1], after = this.evals[ply];
    if (!before || !after || ply < 1) return null;
    return judge(before, after, (ply - 1) % 2 === 0 ? (this.startFen.split(' ')[1] === 'b' ? 'b' : 'w') : (this.startFen.split(' ')[1] === 'b' ? 'w' : 'b'));
  }

  dispose() { this.abort.abort(); this.session?.dispose(); this.onChange = undefined; }
  private changed() { this.onChange?.(); }
}

export function evalText(e: PlyEval | undefined): string {
  if (!e) return '';
  if (e.mate !== undefined) return `${e.mate > 0 ? '' : '-'}M${Math.abs(e.mate)}`;
  const v = (e.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

/** Evaluation graph as SVG path data over plies (White advantage up). */
export function evalGraph(evals: readonly (PlyEval | undefined)[], width: number, height: number): string {
  const pts = evals.map((e, i) => e ? `${(i / Math.max(1, evals.length - 1)) * width},${height - (winChance(e) / 100) * height}` : '').filter(Boolean);
  return pts.length ? `M0,${height} L${pts.join(' L')} L${width},${height} Z` : '';
}
