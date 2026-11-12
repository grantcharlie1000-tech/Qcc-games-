import { MAP } from '../map';

/** The map-fill set pieces that are modelled in code (render/setpieces.ts), by their collision box in map.ts's fill
 * block and their family. Generated from the block's trailing names; a test keeps the two in step. */
export interface SetPieceDef { x0: number; z0: number; x1: number; y1: number; z1: number; name: string; family: string; /** Which way it faces along its short axis, where its room's middle is the wrong answer. */ front?: 1 | -1 }
export const SET_PIECES: SetPieceDef[] = [
  { x0: -8.21, z0: -9.85, x1: -6.85, y1: 2, z1: -9.25, name: 'shelving bay', family: 'shelving' },
  { x0: -11.5, z0: -5.4, x1: -10.3, y1: 1, z1: -4.2, name: 'crate stack', family: 'crates' },
  { x0: -9.0, z0: -5.3, x1: -7.8, y1: 1, z1: -4.1, name: 'crate stack', family: 'crates' },
  { x0: -9.4, z0: -7.555, x1: -8.21, y1: 1, z1: -6.55, name: 'drum cluster', family: 'drums' },
  { x0: -13.9, z0: -6.35, x1: -12.75, y1: 1, z1: -5.35, name: 'equipment crate', family: 'crates' },
  { x0: -5, z0: -9.85, x1: -4.25, y1: 2, z1: -9.3, name: 'storage cabinet', family: 'cabinet' },
  { x0: 11.25, z0: -9.85, x1: 12.25, y1: 2, z1: -9.25, name: 'network cabinet', family: 'cabinet' },
  { x0: 14.25, z0: -8.6, x1: 14.85, y1: 2, z1: -7.25, name: 'UPS cabinet', family: 'cabinet' },
  { x0: 11.4, z0: -7.2, x1: 12.4, y1: 1, z1: -6.2, name: 'UPS unit', family: 'cabinet' },
  { x0: -7.0, z0: -1.93, x1: -5.6, y1: 1, z1: -1.43, name: 'filing run', family: 'filing' },
  { x0: 11.5, z0: -1.93, x1: 12.9, y1: 1, z1: -1.43, name: 'trolley', family: 'trolley' },
  { x0: -8.9, z0: 2.4, x1: -8.2, y1: 0.5, z1: 4.2, name: 'seating group (table)', family: 'lowtable' },
  // The Lobby's and Break Room's original sofas, modelled with the fill's (their boxes are older than the fill).
  { x0: -8.2, z0: 2.2, x1: -7.3, y1: 0.8, z1: 4.4, name: 'lobby sofa', family: 'sofa' },
  { x0: 8.3, z0: 2, x1: 9.15, y1: 0.8, z1: 4, name: 'break room sofa', family: 'sofa' },
  { x0: -9.6, z0: 2.4, x1: -8.9, y1: 0.9, z1: 4.2, name: 'seating group (sofa)', family: 'sofa', front: 1 },
  { x0: -14.85, z0: 2.0, x1: -14.05, y1: 1.9, z1: 3.0, name: 'vending machine', family: 'vending' },
  { x0: -14.85, z0: 7.4, x1: -14.3, y1: 2, z1: 8.9, name: 'display case', family: 'display' },
  { x0: -13.9, z0: 9.25, x1: -12.75, y1: 1, z1: 9.85, name: 'planter', family: 'planter' },
  { x0: -13.0, z0: 7.65, x1: -10.6, y1: 1, z1: 8.0, name: 'planter run', family: 'planter' },
  { x0: -6.15, z0: 9.3, x1: -5.25, y1: 2, z1: 9.85, name: 'cabinet run', family: 'cabinet' },
  { x0: 14.1, z0: 7.9, x1: 14.85, y1: 1.9, z1: 8.9, name: 'vending machine', family: 'vending' },
  { x0: -9.3, z0: 11.4, x1: -6.3, y1: 1.8, z1: 13.1, name: 'skip', family: 'skip' },
  { x0: -16, z0: 16.5, x1: -13.6, y1: 1, z1: 17.7, name: 'pallet stack group', family: 'pallets' },
  { x0: 12.5, z0: 17.0, x1: 17.5, y1: 1, z1: 17.6, name: 'planter', family: 'planter' },
  { x0: 8.5, z0: 18.5, x1: 11.5, y1: 1, z1: 20.0, name: 'materials drop', family: 'materials' },
  { x0: 20, z0: 20.5, x1: 23, y1: 1.9, z1: 22, name: 'bin store', family: 'binstore' },
  { x0: -2, z0: -19.0, x1: 4, y1: 1.9, z1: -16.6, name: 'parked trailer', family: 'trailer' },
  { x0: 11.5, z0: -13.0, x1: 14.5, y1: 1.8, z1: -11.5, name: 'skip', family: 'skip' },
  { x0: 3.5, z0: -13.6, x1: 6.0, y1: 1, z1: -12.4, name: 'pallet stack group', family: 'pallets' },
  { x0: -16, z0: -13.6, x1: -11, y1: 1, z1: -13.1, name: 'low wall', family: 'lowwall' },
  { x0: -20, z0: -20.5, x1: -17.6, y1: 1.9, z1: -19.0, name: 'generator on a plinth', family: 'generator' },
  { x0: 22, z0: -13.5, x1: 25, y1: 1, z1: -12.3, name: 'materials drop', family: 'materials' },
  { x0: -20.5, z0: -3, x1: -18.5, y1: 1, z1: -1.9, name: 'pallet stack group', family: 'pallets' },
  { x0: -21.16, z0: 8.0, x1: -18.16, y1: 1.8, z1: 9.7, name: 'skip', family: 'skip' },
  { x0: -22.0, z0: -0.5, x1: -21.5, y1: 1, z1: 3.5, name: 'low wall', family: 'lowwall' },
  { x0: 26.5, z0: -6, x1: 28, y1: 1.9, z1: -3, name: 'bin store', family: 'binstore' },
  { x0: 20.5, z0: -3.4, x1: 23.0, y1: 1, z1: -2.4, name: 'materials drop', family: 'materials' },
  { x0: 22.0, z0: 7.5, x1: 25.0, y1: 1.8, z1: 9.2, name: 'skip', family: 'skip' },
];
/** Set pieces whose box the art layer still draws, textured (the server racks' photo texture), with only their
 * damage drawn over it by render/setpieces.ts. */
export const TEXTURED_PIECES = new Set(['network cabinet', 'UPS cabinet']);
/** Whether a box is one of the set pieces the art layer leaves out (they are modelled instead). */
export const isSetPiece = (b: { x0: number; z0: number; x1: number; z1: number }) => SET_PIECES.some(p => p.x0 === b.x0 && p.z0 === b.z0 && p.x1 === b.x1 && p.z1 === b.z1 && !TEXTURED_PIECES.has(p.name));

/** The local frame of a box: its long axis, and which way its front faces (away from a solid wall it stands
 * against, or else towards the open side of the room or yard). */
export function frame(p: Pick<SetPieceDef, 'x0' | 'z0' | 'x1' | 'z1'>) {
  const alongX = p.x1 - p.x0 >= p.z1 - p.z0, L = alongX ? p.x1 - p.x0 : p.z1 - p.z0, D = alongX ? p.z1 - p.z0 : p.x1 - p.x0;
  const touch = (x0: number, z0: number, x1: number, z1: number) => MAP.boxes.some(b => b.solid && b.y0 < 0.3 && b.y1 > 2.5 && b.x0 <= x1 + 0.03 && b.x1 >= x0 - 0.03 && b.z0 <= z1 + 0.03 && b.z1 >= z0 - 0.03 && !(b.x0 === p.x0 && b.z0 === p.z0));
  // With no wall at its back, a piece faces the middle of its room (or yard).
  const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, r = MAP.rooms.find(q => cx > q.x0 && cx < q.x1 && cz > q.z0 && cz < q.z1);
  const room = r ? { x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 } : { x: 0, z: 0 };
  let front: number;
  if (alongX) {
    const backN = touch(p.x0, p.z0 - 0.02, p.x1, p.z0), backS = touch(p.x0, p.z1, p.x1, p.z1 + 0.02);
    front = (p as SetPieceDef).front ?? (backN && !backS ? 1 : backS && !backN ? -1 : ((p.z0 + p.z1) / 2 < room.z ? 1 : -1));
  } else {
    const backW = touch(p.x0 - 0.02, p.z0, p.x0, p.z1), backE = touch(p.x1, p.z0, p.x1 + 0.02, p.z1);
    front = (p as SetPieceDef).front ?? (backW && !backE ? 1 : backE && !backW ? -1 : ((p.x0 + p.x1) / 2 < room.x ? 1 : -1));
  }
  return { alongX, L, D, front };
}
