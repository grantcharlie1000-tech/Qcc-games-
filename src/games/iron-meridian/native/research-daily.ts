import type { ResearchModifierDependencies, ResearchModifierMemory, ResearchModifierResult } from './research-modifiers';
import { researchModifiersDaily } from './research-modifiers';
import type { ResearchCostResult } from './research-cost';
import { researchTechnologyDenominatorDaily } from './research-cost';
import type { ResearchRateBoundaryResult } from './research-rate';
import { researchRateAfterHelpers } from './research-rate';

export type ResearchDailyMemory = ResearchModifierMemory;
export type ResearchDailyResult = {
  modifiers: ResearchModifierResult;
  helper140b205b0Stack20: bigint;
} & (
  | (ResearchRateBoundaryResult & { cost: Extract<ResearchCostResult, { kind: 'returned' }> })
  | Extract<ResearchCostResult, { kind: 'runtime-required' }>
);

/** Bounded original 0x140F53350 daily path over explicit raw state and remaining modifier leaves. */
export function researchDaily(memory: ResearchDailyMemory, state: bigint, dependencies: ResearchModifierDependencies): ResearchDailyResult {
  const at = (offset: bigint) => BigInt.asUintN(64, state + offset);
  const modifiers = researchModifiersDaily(memory, state, dependencies);
  // 0x140F53398-0x140F533D4 captures both raw fields and the definition after the modifier call.
  const rawStatusOffset1c8 = memory.readQword(at(0x1c8n));
  const rawStatusOffset1c0 = memory.readQword(at(0x1c0n));
  const definition = memory.readQword(at(0x160n));
  const helper140b205b0Stack20 = BigInt.asIntN(64, modifiers.stack38 + rawStatusOffset1c0);
  const cost = researchTechnologyDenominatorDaily(memory, definition, helper140b205b0Stack20);
  if (cost.kind === 'runtime-required') return { ...cost, modifiers, helper140b205b0Stack20 };

  const rate = researchRateAfterHelpers({
    helper140f537e0Stack30: modifiers.stack30,
    helper140f537e0Stack38: modifiers.stack38,
    rawStatusOffset1c0,
    rawStatusOffset1c8,
    helper140b205b0Pointee: cost.value,
    // 0x140F53419 is reached only after division/fallback succeeds. Preserve its deferred read.
    get runtimeGlobal1433e4658() { return memory.readQword(0x1433e4658n); },
  });
  return { ...rate, modifiers, cost };
}
