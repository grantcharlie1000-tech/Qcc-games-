import type {GameId} from './types';
// Permanent public references: keep these IDs stable when the catalog is reordered.
const entries:readonly GameId[]=['color-blocks','water-sort','fruit-merge','tower','flappy-bird','ball-run','animal-stack','snake','neon-coil','minesweeper','solitaire','block-fill','color-connect','pool','globle','blockcraft','maze-muncher','corn-clicker','quadfall'];
export const collectionHash='#/collection';
export const entryHash=(id:GameId)=>`${collectionHash}/${entries.indexOf(id)+1}`;
export function entryFromHash(hash:string):GameId|undefined{
 // A game link may carry options after `?` (an online room invite: `?room=CODE`).
 const reference=hash.match(/^#\/collection\/([1-9]\d*)(?:\?.*)?$/);
 if(reference)return entries[Number(reference[1])-1];
 const legacy=hash.match(/^#\/game\/([a-z-]+)(?:\?.*)?$/)?.[1];
 return entries.find(id=>id===legacy);
}
