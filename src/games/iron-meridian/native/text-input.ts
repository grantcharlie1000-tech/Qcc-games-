import { NativeInputObject } from './input-object';
import type { InputObjectMemory, InputObjectResult, InputObjectServices } from './input-object';
import type { NativeFileOpenWorkspace } from './file-open';
import type { NativeKeywordRegistry } from './keyword-registry';

const u64 = (value: bigint) => BigInt.asUintN(64, value);
/** Actual14253DD40 derived text-input wrapper. */
export class NativeTextInput {
  private readonly base: NativeInputObject;
  constructor(private readonly memory: InputObjectMemory, services: InputObjectServices, gsBase: bigint, registry?: NativeKeywordRegistry) {
    this.base = new NativeInputObject(memory, services, gsBase, registry);
  }
  construct(object: bigint, nameRecord: bigint, bomMode: number, entryStack: bigint, workspace: NativeFileOpenWorkspace): InputObjectResult<bigint> {
    object = u64(object); nameRecord = u64(nameRecord); entryStack = u64(entryStack); bomMode |= 0;
    const result = this.base.construct(object, nameRecord, 1, bomMode, u64(entryStack - 0x30n), workspace);
    if (result.kind !== 'returned') return result;
    this.memory.writeQword(object, 0x142c04da0n);
    return { kind: 'returned', value: object };
  }
}
