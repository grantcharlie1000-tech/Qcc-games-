import { NativeKeywordRecord } from './keyword-record';
import type { KeywordRecordMemory, KeywordRecordResult, KeywordRecordServices } from './keyword-record';

export interface GeneratedKeywordPlan {
  readonly targetSha256: string;
  readonly frameBytes: number;
  readonly destructor: string;
  /** record address, ID address, byte-name address, enum local offset, enum home offset, original block PC */
  readonly records: readonly (readonly [string, string, string, number, number, string])[];
}
export interface KeywordInitializationServices extends KeywordRecordServices {
  /** Individual __chkstk leaf preserves RAX and the native ABI. */
  stackProbe?(bytes: bigint): void;
  registerExit?(destructor: bigint): bigint;
}
export type KeywordInitializationResult = KeywordRecordResult & { enteredRecords: number; completedRecords: number };

export class NativeKeywordInitialization {
  private readonly entries: readonly (readonly [bigint, bigint, bigint, bigint, bigint])[];
  private readonly constructorPort: NativeKeywordRecord;
  constructor(private readonly memory: KeywordRecordMemory, private readonly services: KeywordInitializationServices, gsBase: bigint, plan: GeneratedKeywordPlan) {
    if (plan.targetSha256 !== '709f916afbebcfe64a26678702691aeb40945d206074c2a80de8e9d601fce148' || plan.frameBytes !== 0x1f8e8 || plan.destructor !== '0x142781c00' || plan.records.length !== 10767) throw Error('Different generated native initializer plan');
    // The plan represents immutable instructions. Copy its addresses before callbacks run.
    this.entries = plan.records.map((row, index) => {
      if (BigInt(row[0]) !== 0x14343af20n + BigInt(index * 72) || row[3] !== 0x20 + index * 4 || row[4] !== 0xa860 + index * 8) throw Error('Different native enum or record layout');
      return [BigInt(row[0]), BigInt(row[1]), BigInt(row[2]), BigInt(row[3]), BigInt(row[4])] as const;
    });
    this.constructorPort = new NativeKeywordRecord(memory, services, gsBase);
  }
  run(entryStack: bigint): KeywordInitializationResult {
    const u64 = (value: bigint) => BigInt.asUintN(64, value);
    let enteredRecords = 0, completedRecords = 0;
    if (!this.services.stackProbe) return { kind: 'runtime-required', boundary: 'stack-probe', nativeAddress: 0x1425a07d0n, callSite: 0x140083765n, enteredRecords, completedRecords };
    this.services.stackProbe(0x1f8e8n);
    const frame = u64(entryStack - 0x1f8e8n);
    for (const [record, identifierSource, name, enumOffset, homeOffset] of this.entries) {
      // Original generated block: publish home, load ID, reload home, execute 140153750,
      // then read the helper's output before entering the real record constructor.
      this.memory.writeQword(u64(frame + homeOffset), u64(frame + enumOffset));
      const identifier = this.memory.readDword(u64(identifierSource)) >>> 0;
      const enumPointer = u64(this.memory.readQword(u64(frame + homeOffset)));
      this.memory.writeDword(enumPointer, identifier);
      const constructorIdentifier = this.memory.readDword(enumPointer) >>> 0;
      enteredRecords++;
      const result = this.constructorPort.construct(u64(record), constructorIdentifier, u64(name));
      if (result.kind !== 'returned') return { ...result, enteredRecords, completedRecords };
      completedRecords++;
    }
    if (!this.services.registerExit) return { kind: 'runtime-required', boundary: 'atexit-registration', nativeAddress: 0x1425a0450n, callSite: 0x140119483n, enteredRecords, completedRecords };
    const value = u64(this.services.registerExit(0x142781c00n));
    return { kind: 'returned', value, enteredRecords, completedRecords };
  }
}
