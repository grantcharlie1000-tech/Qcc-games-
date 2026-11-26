import type { Color } from '../rules';
import type { Category } from '../time-control';

/** JSON shapes exchanged with /.netlify/functions/chess. */
export const CHESS_ENDPOINT = '/.netlify/functions/chess';

export interface RankedPlayerView { readonly name: string; readonly rating: number | null; readonly change: number | null }
export interface RankedGameView {
  readonly id: string;
  readonly rated: boolean;
  readonly category: Category;
  readonly baseMs: number;
  readonly incrementMs: number;
  readonly white: RankedPlayerView;
  readonly black: RankedPlayerView;
  /** Ratings before the game, for display while it is running. */
  readonly ratings?: { readonly w: number; readonly b: number };
  readonly color: Color | null;
  /** Omitted when `unchanged` is true. */
  readonly moves?: readonly string[];
  readonly unchanged?: boolean;
  readonly revision: number;
  readonly status: 'active' | 'finished' | 'aborted';
  readonly result: string | null;
  readonly termination: string | null;
  readonly drawOffer: Color | null;
  /** Remaining ms at the server's time of answering. */
  readonly clock: { readonly w: number; readonly b: number; readonly running: boolean };
  readonly firstMoveMsLeft: number | null;
  readonly createdAt: number;
  readonly finishedAt: number | null;
}

export type RankedQueueView =
  | { readonly state: 'idle' }
  | { readonly state: 'searching'; readonly category: Category; readonly timeControl: string; readonly waitedMs: number; readonly range: number }
  | { readonly state: 'matched'; readonly gameId: string };

export interface CategoryStats {
  readonly rating: number; readonly provisional: boolean; readonly games: number; readonly wins: number; readonly losses: number;
  readonly draws: number; readonly streak: number; readonly best: number; readonly change: number;
}
export interface HistoryEntry {
  readonly id: string; readonly category: Category; readonly timeControl: string; readonly result: string; readonly termination: string;
  readonly plies: number; readonly color: Color; readonly opponent: string; readonly rating: number | null; readonly change: number | null; readonly finishedAt: number;
}
export interface ProfileView { readonly name: string; readonly ratings: Record<Category, CategoryStats>; readonly recent: readonly HistoryEntry[] }
export interface MeView extends ProfileView { readonly activeGameId: string | null }
export interface LeaderboardEntry {
  readonly rank: number; readonly name: string; readonly rating: number; readonly provisional: boolean; readonly games: number;
  readonly wins: number; readonly losses: number; readonly draws: number; readonly change: number; readonly streak: number;
}
export interface LeaderboardView { readonly category: Category; readonly entries: readonly LeaderboardEntry[]; readonly me: LeaderboardEntry | null }

export type RankedCommand = 'move' | 'resign' | 'abort' | 'offer-draw' | 'decline-draw' | 'claim-draw';
