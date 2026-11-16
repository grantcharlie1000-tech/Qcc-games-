import type {ChessAIProviderManifest} from '../../types';

/** These are QCC custom opponents. No Dala or Maia model is used. */
export const manifest:ChessAIProviderManifest={
  id:'qcc-beginner',name:'QCC Beginner',version:'1.0.0',engine:'custom',
  license:'MIT AND BSD-2-Clause',opponents:['elo-300','elo-500','elo-700','elo-900'],
  analysis:false,priority:0,downloadBytes:45_000,
};
