import {describe,it,expect} from 'vitest';
import {LEVELS} from '../../../src/games/last-light/levels';
import {minimumHopChanges,POLICY_PHASES} from './difficulty';

// Full authoring audit: LAST_LIGHT_FULL_DIFFICULTY=1 npx vitest run tests/games/last-light/difficulty.test.ts
const fullAudit=process.env.LAST_LIGHT_FULL_DIFFICULTY==='1';

describe('Last Light required control choices',()=>{
 // Widening every transit ledge, or adding an easy branch around a precision
 // section, used to leave a longer campaign solvable with the same hop. The
 // baseline fails these bounds even though all its journeys are playable.
 // The full six-phase audit covers every chapter when authoring changes.
 // These representatives keep the normal test run focused and repeatable.
 for(const level of fullAudit?LEVELS:[0,7,16,24,32,39].map(id=>LEVELS[id]))it(`${level.id+1}: the tested start-to-exit graph rejects repeated midair hops`,async()=>{
  await new Promise(resolve=>setTimeout(resolve,0));
  const route=minimumHopChanges(level,fullAudit?POLICY_PHASES:[0,1.8]);
  expect(Number.isFinite(route.changes),'No route found by the local audit; inspect the continuous witness').toBe(true);
  const required=level.id<=1?1:level.id<8?2:3;
  if(fullAudit)console.info(JSON.stringify({chapter:level.id+1,required,changes:route.changes,path:route.path,changedEdges:route.changedEdges}));
  expect(route.changes,`The tested graph needs ${route.changes} policy departures along ${route.path.join(' → ')}`).toBeGreaterThanOrEqual(required);
 },30000);
});
