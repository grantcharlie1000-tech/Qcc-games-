export const GAME_IDS = ['fruit-merge','water-sort','color-blocks','tower','snake','minesweeper','solitaire','block-fill','color-connect','ball-run','pool','animal-stack'] as const;
export type GameId = typeof GAME_IDS[number];
export interface Settings { sound: boolean; reducedMotion: boolean; colorBlind: boolean }
export interface GameContext {
  readonly id: GameId;
  readonly settings: Readonly<Settings>;
  readonly highScore: number;
  setScore(score: number): void;
  setLevel(level: string | number): void;
  setStatus(message: string): void;
  announce(message: string): void;
  save(data: unknown): void;
  sound(kind?: 'tap' | 'success' | 'lose'): void;
}
export interface GameInstance {
  pause(): void;
  resume(): void;
  restart(): void;
  serialize(): unknown;
  restore(data: unknown): void;
  dispose(): void;
}
export interface GameModule {
  readonly id: GameId;
  readonly title: string;
  readonly cover: string;
  readonly rules: string;
  mount(container: HTMLElement, context: GameContext): GameInstance | Promise<GameInstance>;
}
