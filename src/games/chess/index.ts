import type { GameModule } from '../../core/types';
import { ChessApp } from './app';
import './style.css';

const game: GameModule = {
  id: 'chess',
  title: 'Chess',
  cover: 'game-art/chess/cover.svg',
  rules: `Standard chess. Checkmate the opposing king to win.

Tap or drag a piece, then tap or drop it on a highlighted square. Castle by moving the king two squares. Pawns promote on the last rank; choose the piece.

Draws: stalemate, insufficient material, agreement, fivefold repetition and the 75-move rule end the game. Threefold repetition and the 50-move rule can be claimed on your turn.

Modes: Computer (engines that are installed), Pass and play, Friend (private, unrated) and Ranked (online, rated by QCC's Glicko-2 ratings, separate from other sites). Ranked games need a QCC account; the server keeps the clocks and judges every move.

Keyboard: focus the board, move with the arrow keys and press Enter to pick up and place a piece. Left and Right step through moves. Right-drag draws arrows.`,
  mount: (container, context) => new ChessApp(container, context),
};
export default game;
