import { ChessRules, START_FEN } from './rules';

export type AcademyGroup = 'Foundations' | 'Tactics' | 'Checkmates' | 'Endgames';
export interface AcademyStep {
  readonly prompt: string;
  readonly move: string;
  readonly hint: string;
  readonly why: string;
  readonly reply?: string;
}
export interface AcademyLesson {
  readonly id: string;
  readonly group: AcademyGroup;
  readonly title: string;
  readonly intro: string;
  readonly fen?: string;
  readonly setup?: readonly string[];
  readonly steps: readonly AcademyStep[];
}

/** Original bite-sized exercises. Every move is checked against the game's real rules. */
export const ACADEMY_LESSONS: readonly AcademyLesson[] = [
  {
    "id": "centre-pawn",
    "group": "Foundations",
    "title": "Take the centre",
    "intro": "Central pawns make space for your pieces.",
    "steps": [
      {
        "prompt": "Move White's king pawn two squares.",
        "move": "e2e4",
        "hint": "The pawn in front of your king begins on e2.",
        "why": "1. e4 controls d5 and f5 and opens your queen and bishop."
      }
    ]
  },
  {
    "id": "develop-knights",
    "group": "Foundations",
    "title": "Knights first",
    "intro": "Develop pieces instead of moving the same pawn repeatedly.",
    "steps": [
      {
        "prompt": "Develop your kingside knight towards the centre.",
        "move": "g1f3",
        "hint": "The g1 knight can hop to f3.",
        "why": "Nf3 attacks central squares and helps prepare castling.",
        "reply": "g8f6"
      },
      {
        "prompt": "Now develop your other knight.",
        "move": "b1c3",
        "hint": "Look for the knight on b1.",
        "why": "Nc3 puts a second piece into the game. The opponent has developed too."
      }
    ]
  },
  {
    "id": "open-bishop",
    "group": "Foundations",
    "title": "Open a bishop",
    "intro": "Pawn moves should give your pieces room to breathe.",
    "setup": [
      "e2e4",
      "e7e5"
    ],
    "steps": [
      {
        "prompt": "Develop the bishop toward Black's king.",
        "move": "f1c4",
        "hint": "Follow the diagonal from f1 to c4.",
        "why": "Bc4 points at f7, a square often worth watching early."
      }
    ]
  },
  {
    "id": "save-e5",
    "group": "Foundations",
    "title": "Defend the centre",
    "intro": "An attacked pawn needs a plan, not panic.",
    "setup": [
      "e2e4",
      "e7e5",
      "g1f3"
    ],
    "steps": [
      {
        "prompt": "Play as Black. Protect the pawn on e5 by developing a knight.",
        "move": "b8c6",
        "hint": "The knight on b8 can move to c6.",
        "why": "...Nc6 develops a piece and protects e5 at the same time."
      }
    ]
  },
  {
    "id": "castle",
    "group": "Foundations",
    "title": "King safety",
    "intro": "Castling gets your king away from the open centre.",
    "setup": [
      "e2e4",
      "e7e5",
      "g1f3",
      "b8c6",
      "f1c4",
      "g8f6"
    ],
    "steps": [
      {
        "prompt": "Castle kingside in one move.",
        "move": "e1g1",
        "hint": "Move your king from e1 to g1. The rook moves automatically.",
        "why": "O-O brings your rook toward the centre and shelters the king."
      }
    ]
  },
  {
    "id": "en-passant",
    "group": "Foundations",
    "title": "En passant",
    "intro": "A special pawn capture is possible immediately after a neighbouring pawn moves two squares.",
    "setup": [
      "e2e4",
      "a7a6",
      "e4e5",
      "d7d5"
    ],
    "steps": [
      {
        "prompt": "Capture Black's d5 pawn en passant.",
        "move": "e5d6",
        "hint": "Move the white pawn diagonally from e5 to d6.",
        "why": "En passant captures the pawn on d5 even though your pawn lands on d6. You can only do it immediately."
      }
    ]
  },
  {
    "id": "free-pawn",
    "group": "Tactics",
    "title": "An undefended pawn",
    "intro": "Before you move, look for pieces and pawns left hanging.",
    "fen": "6k1/8/8/4p3/8/5N2/8/6K1 w - - 0 1",
    "steps": [
      {
        "prompt": "Find a free pawn for your knight to capture.",
        "move": "f3e5",
        "hint": "Knights jump in an L. Check the pawn on e5.",
        "why": "Nxe5 wins an undefended pawn. Always check whether the capturing piece can be taken back."
      }
    ]
  },
  {
    "id": "win-queen",
    "group": "Tactics",
    "title": "Win the queen",
    "intro": "A bishop's long diagonal can be easy to overlook.",
    "fen": "k7/5q2/8/8/2B5/8/8/6K1 w - - 0 1",
    "steps": [
      {
        "prompt": "The black queen is undefended. Capture it.",
        "move": "c4f7",
        "hint": "Trace the bishop's diagonal from c4 through d5 and e6.",
        "why": "Bxf7 wins the queen. Spot loose pieces before planning an attack."
      }
    ]
  },
  {
    "id": "knight-fork",
    "group": "Tactics",
    "title": "The knight fork",
    "intro": "Knights can attack valuable targets at the same time.",
    "fen": "r3k3/8/8/1N6/8/8/8/6K1 w - - 0 1",
    "steps": [
      {
        "prompt": "Check the king and attack the rook with one knight move.",
        "move": "b5c7",
        "hint": "A knight on c7 attacks both e8 and a8.",
        "why": "Nc7+ forks the king and rook. Black must respond to check.",
        "reply": "e8f8"
      },
      {
        "prompt": "Now collect the rook.",
        "move": "c7a8",
        "hint": "The rook is on a8.",
        "why": "Nxa8 wins a rook. Forks work because the opponent cannot save both targets."
      }
    ]
  },
  {
    "id": "escape-check",
    "group": "Tactics",
    "title": "Answer a check",
    "intro": "When in check, you must remove the threat before doing anything else.",
    "fen": "k7/8/8/8/8/8/5PPP/R3r1K1 w - - 0 1",
    "steps": [
      {
        "prompt": "Your king is in check. Capture the attacking rook.",
        "move": "a1e1",
        "hint": "Your rook on a1 can travel across the first rank.",
        "why": "Rxe1 ends the check and wins the attacking rook. First identify the checking piece."
      }
    ]
  },
  {
    "id": "scholars-defence",
    "group": "Tactics",
    "title": "Stop Scholar's Mate",
    "intro": "Early queen attacks often target f7. The right defence creates threats of its own.",
    "setup": [
      "e2e4",
      "e7e5",
      "d1h5",
      "b8c6",
      "f1c4"
    ],
    "steps": [
      {
        "prompt": "Play Black. Attack the queen and stop the immediate threat to f7.",
        "move": "g7g6",
        "hint": "The pawn on g7 can step forward and attack the queen on h5.",
        "why": "...g6 blocks the queen's diagonal to f7 and attacks the queen. Don't play ...Nf6?? here: Qxf7# would follow."
      }
    ]
  },
  {
    "id": "back-rank",
    "group": "Checkmates",
    "title": "Back-rank mate",
    "intro": "A king trapped behind its own pawns can be mated by a rook.",
    "fen": "6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1",
    "steps": [
      {
        "prompt": "Find checkmate in one with your rook.",
        "move": "a1a8",
        "hint": "Put the rook on the eighth rank.",
        "why": "Ra8# controls every escape on the back rank. The pawns block the king from fleeing."
      }
    ]
  },
  {
    "id": "queen-mate",
    "group": "Checkmates",
    "title": "Queen and king",
    "intro": "A queen and king can work together to box in the enemy king.",
    "fen": "7k/8/5KQ1/8/8/8/8/8 w - - 0 1",
    "steps": [
      {
        "prompt": "Deliver checkmate in one.",
        "move": "g6g7",
        "hint": "Put the queen on a square protected by your king.",
        "why": "Qg7# checks the king on h8. Your king protects the queen and the queen covers every escape."
      }
    ]
  },
  {
    "id": "avoid-stalemate",
    "group": "Checkmates",
    "title": "Mate, not stalemate",
    "intro": "A trapped king is not enough. For checkmate, the king must also be in check.",
    "fen": "k7/8/1QK5/8/8/8/8/8 w - - 0 1",
    "steps": [
      {
        "prompt": "Find a move that CHECKS the king and leaves no escape.",
        "move": "b6b7",
        "hint": "Qc7 would stalemate Black. Give check with Qb7 instead.",
        "why": "Qb7# is checkmate. Qc7 would give Black no legal moves but no check: stalemate, a draw."
      }
    ]
  },
  {
    "id": "promotion",
    "group": "Endgames",
    "title": "Promote your pawn",
    "intro": "Reach the final rank with a pawn and choose a stronger piece.",
    "fen": "k7/4P3/6K1/8/8/8/8/8 w - - 0 1",
    "steps": [
      {
        "prompt": "Promote the e7 pawn to a queen.",
        "move": "e7e8q",
        "hint": "Move the pawn to e8 and choose Queen in the promotion menu.",
        "why": "e8=Q creates a new queen. Promotion is usually the biggest goal in a pawn endgame."
      }
    ]
  }
];

export const ACADEMY_GROUPS: readonly AcademyGroup[] = ['Foundations', 'Tactics', 'Checkmates', 'Endgames'];

export function academyStart(lesson: AcademyLesson): ChessRules {
  const rules = new ChessRules(lesson.fen ?? START_FEN);
  for (const move of lesson.setup ?? []) {
    if (!rules.move(move)) throw new Error('Invalid academy setup: ' + lesson.id + ' ' + move);
  }
  return rules;
}

/** Also used by tests to prevent shipping a lesson with an illegal solution. */
export function validateAcademy(): void {
  const ids = new Set<string>();
  for (const lesson of ACADEMY_LESSONS) {
    if (ids.has(lesson.id) || !lesson.steps.length) throw new Error('Invalid academy lesson: ' + lesson.id);
    ids.add(lesson.id);
    const rules = academyStart(lesson);
    const color = rules.turn;
    for (const step of lesson.steps) {
      if (rules.turn !== color || !rules.move(step.move)) throw new Error('Illegal academy move: ' + lesson.id + ' ' + step.move);
      if (step.reply && !rules.move(step.reply)) throw new Error('Illegal academy reply: ' + lesson.id + ' ' + step.reply);
    }
  }
}
