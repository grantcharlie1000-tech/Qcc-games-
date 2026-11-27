import { NativeKeywordRecord } from './keyword-record';
import type { KeywordRecordMemory, KeywordRecordResult, KeywordRecordServices } from './keyword-record';

const u64 = (value: bigint) => BigInt.asUintN(64, value);
export class NativeParserState {
  private readonly vectors: NativeKeywordRecord;
  constructor(private readonly memory: KeywordRecordMemory, services: KeywordRecordServices, private readonly gsBase: bigint) {
    this.vectors = new NativeKeywordRecord(memory, services, gsBase);
  }
  private at(pointer: bigint, offset: bigint) { return u64(pointer + offset); }
  private q(pointer: bigint) { return u64(this.memory.readQword(u64(pointer))); }
  private wq(pointer: bigint, value: bigint) { this.memory.writeQword(u64(pointer), u64(value)); }
  private plainVector(pointer: bigint): KeywordRecordResult {
    // 14011F6F6 captures the module TLS index before clearing either header qword.
    const index = this.memory.readDword(0x143693a98n) >>> 0;
    this.wq(pointer, 0n); this.wq(this.at(pointer, 8n), 0n);
    const thread = this.q(this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(index) * 8n));
    if ((this.memory.readDword(this.at(thread, 0x20ecn)) | 0) < (this.memory.readDword(0x1433dd120n) | 0)) {
      return { kind: 'runtime-required', boundary: 'tls-guard-acquire', nativeAddress: 0x1425a0588n, callSite: 0x14011f740n };
    }
    this.wq(this.at(pointer, 0x10n), 0x1430fd000n);
    return { kind: 'returned', value: pointer };
  }
  construct(parser: bigint, input: bigint): KeywordRecordResult {
    parser = u64(parser); input = u64(input);
    this.wq(parser, 0x142c05150n); this.wq(this.at(parser, 8n), 0n); this.wq(this.at(parser, 0x10n), 0n);
    this.memory.writeDword(this.at(parser, 0x18n), 0); this.memory.writeByte(this.at(parser, 0x1cn), 0); this.memory.writeByte(this.at(parser, 0x20n), 0);
    this.wq(this.at(parser, 0x28n), input);
    for (const offset of [0x30n, 0x78n, 0xc0n]) {
      this.memory.writeDword(this.at(parser, offset), 0); this.memory.writeByte(this.at(parser, offset + 4n), 0);
      const result = this.vectors.initializeVector(this.at(parser, offset + 8n));
      if (result.kind !== 'returned') return result;
    }
    const first = this.plainVector(this.at(parser, 0x108n));
    if (first.kind !== 'returned') return first;
    this.memory.writeByte(this.at(parser, 0x120n), 0); this.wq(this.at(parser, 0x128n), 0n);
    const second = this.plainVector(this.at(parser, 0x130n));
    if (second.kind !== 'returned') return second;
    this.memory.writeByte(this.at(parser, 0x148n), 0xaa); this.memory.writeByte(this.at(parser, 0x14cn), 0);
    return { kind: 'returned', value: parser };
  }
  currentToken(input: bigint): KeywordRecordResult { return { kind: 'returned', value: this.at(input, 0x18n) }; }
}
