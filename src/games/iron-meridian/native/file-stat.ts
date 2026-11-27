import { NativeFileOpen } from './file-open';
import type { NativeFileOpenDependencies, NativeFileOpenWorkspace, NativeFileOpenResult } from './file-open';
import type { NativeFileIoMemory } from './file-io';

export type NativeFileStatResult = NativeFileOpenResult;
type Stop = Exclude<NativeFileStatResult, {kind:'returned'}>;
class OpenStop { constructor(readonly result: Stop) {} }
const u64 = (value:bigint) => BigInt.asUintN(64,value);

/** Actual exported stat caller and mount ancestor helper over supplied native state. */
export class NativeFileStat {
  private readonly helper: NativeFileOpen;
  constructor(private readonly memory:NativeFileIoMemory, private readonly dependencies:NativeFileOpenDependencies, private readonly gsBase:bigint) {
    this.helper = new NativeFileOpen(memory, dependencies, gsBase);
  }
  private at(address: bigint, offset: bigint): bigint { return u64(address + offset); }
  private q(address: bigint): bigint { return u64(this.memory.readQword(u64(address))); }
  private byte(address: bigint): number { return this.memory.readByte(u64(address)) & 255; }
  private int(address: bigint): number { return this.memory.readDword(u64(address)) | 0; }
  private put(address: bigint, value: bigint): void { this.memory.writeQword(u64(address), u64(value)); }
  private putByte(address: bigint, value: number): void { this.memory.writeByte(u64(address), value & 255); }
  private stop(result: Stop): never { throw new OpenStop(result); }
  private required(boundary: string, nativeAddress: bigint, callSite: bigint): never {
    return this.stop({ kind: 'runtime-required', boundary, nativeAddress, callSite });
  }
  private run(operation: () => bigint): NativeFileOpenResult {
    try { return { kind: 'returned', value: operation() }; }
    catch (error) { if (error instanceof OpenStop) return error.result; throw error; }
  }
  private tlsEntry(): bigint {
    return this.at(this.q(this.at(this.gsBase, 0x58n)), BigInt(this.memory.readDword(0x143693a98n) >>> 0) * 8n);
  }
  private error(value: number): void { this.memory.writeDword(this.at(this.q(this.tlsEntry()), 0x20e4n), value); }
  private length(path: bigint): bigint {
    let length = 0n;
    while (this.byte(this.at(path, length)) !== 0) length = u64(length + 1n);
    return length;
  }
  /** Same complete accessor as the independently verified supplied-handle IO slice. */
  private state(): bigint {
    if (this.int(0x1436919c0n) > this.int(this.at(this.q(this.tlsEntry()), 0x20ecn))) {
      if (!this.dependencies.initializeHeader1425a0588) return this.required('initialize-header', 0x1425a0588n, 0x14257bdcan);
      this.dependencies.initializeHeader1425a0588(0x1436919c0n);
      if (this.int(0x1436919c0n) === -1) {
        const clear16 = (address: bigint) => { this.put(address, 0n); this.put(this.at(address, 8n), 0n); };
        this.memory.writeDword(0x143691960n, -1);
        clear16(0x1436918c0n); clear16(0x1436918e0n); clear16(0x1436918d0n);
        this.put(0x1436918f0n, 0n); this.put(0x1436918f8n, 0n); clear16(0x143691900n);
        this.put(0x143691910n, 0n); clear16(0x143691930n);
        this.memory.writeDword(0x143691918n, 0x102); clear16(0x143691940n);
        this.memory.writeDword(0x143691964n, 0); clear16(0x143691950n);
        this.memory.writeDword(0x1436919b0n, -1); clear16(0x143691920n); clear16(0x143691980n);
        this.memory.writeDword(0x143691968n, 0x102); clear16(0x143691990n);
        this.memory.writeDword(0x1436919b4n, 0); clear16(0x1436919a0n);
        this.putByte(0x1436919b8n, 0); this.putByte(0x1436919b9n, 0);
        clear16(0x143691970n); this.putByte(0x1436919ban, 0);
        if (!this.dependencies.initializeFooter1425a051c) return this.required('initialize-footer', 0x1425a051cn, 0x14257be97n);
        this.dependencies.initializeFooter1425a051c(0x1436919c0n);
      }
    }
    return 0x1436918c0n;
  }
  private lock(mutex: bigint, site: bigint): void {
    if (!this.dependencies.lock1425a3b80) return this.required('mutex-lock', 0x1425a3b80n, site);
    if ((this.dependencies.lock1425a3b80(mutex) | 0) !== 0) return this.stop({ kind: 'native-exception', code: 5, nativeAddress: 0x1425a3dfcn });
    if (this.int(this.at(mutex, 0x4cn)) === 0x7fffffff) {
      this.memory.writeDword(this.at(mutex, 0x4cn), 0x7ffffffe);
      return this.stop({ kind: 'native-exception', code: 6, nativeAddress: 0x1425a3dfcn });
    }
  }
  private unlock(mutex: bigint, site: bigint): void {
    if (!this.dependencies.unlock1425a3b88) return this.required('mutex-unlock', 0x1425a3b88n, site);
    this.dependencies.unlock1425a3b88(mutex);
  }
  private allocate(bytes: bigint, site: bigint): bigint {
    const target = this.q(0x1436918a0n);
    if (!this.dependencies.allocate) return this.required('allocator-allocate', target, site);
    return u64(this.dependencies.allocate(target, u64(bytes)));
  }
  private free(pointer: bigint, site: bigint): void {
    const target = this.q(0x1436918b0n);
    if (!this.dependencies.free) return this.required('allocator-free', target, site);
    this.dependencies.free(target, pointer);
  }

  private take(result: NativeFileOpenResult): bigint {
    if (result.kind === 'returned') return result.value;
    return this.stop(result);
  }
  /** Complete0x14257e990; compare leaf may mutate the mount-point pointer. */
  private ancestor(mount:bigint,path:bigint):bigint {
    const name = this.q(this.at(mount,0x10n));
    if (name === 0n) return 0n;
    if (this.byte(path) === 0) return 1n;
    const pathLength=this.length(path), nameLength=this.length(name);
    if (pathLength > nameLength || u64(pathLength+1n) === nameLength) return 0n;
    if (!this.dependencies.comparePrefix1425ceb80) return this.required('crt-compare-prefix',0x1425ceb80n,0x14257e9fdn);
    if ((this.dependencies.comparePrefix1425ceb80(path,name,pathLength)|0) !== 0) return 0n;
    return this.byte(this.at(this.q(this.at(mount,0x10n)),pathLength)) === 47 ? 1n : 0n;
  }
  mountAncestor(mount:bigint,path:bigint):NativeFileStatResult {
    return this.run(()=>this.ancestor(u64(mount),u64(path)));
  }
  /** Complete exported PHYSFS_stat0x14257b540. Output is the caller-owned40-byte record. */
  stat(path:bigint,output:bigint,workspace:NativeFileOpenWorkspace):NativeFileStatResult {
    return this.run(()=>{
      path=u64(path); output=u64(output);
      if (path===0n || output===0n) { this.error(9); return 0n; }
      for (let offset=0n;offset<32n;offset+=8n) this.put(this.at(output,offset),-1n);
      this.memory.writeDword(this.at(output,0x20n),3); this.memory.writeDword(this.at(output,0x24n),1);
      const state=this.state(), mountHead=this.at(state,8n), mutex=this.at(state,0x58n);
      const frozen=this.byte(this.at(state,0xfan));
      if (frozen===0) this.lock(mutex,0x14257b5e4n);
      const size=u64(this.length(path)+this.q(this.at(state,0x40n))+1n), heap=size>=512n;
      let header:bigint;
      if (heap) header=this.allocate(u64(size+8n),0x14257b663n);
      else {
        if (!this.dependencies.probeStack1425a07d0) return this.required('crt-stack-probe',0x1425a07d0n,0x14257b637n);
        this.dependencies.probeStack1425a07d0((size+23n)&~15n); header=u64(workspace.stackHeader);
      }
      if (header===0n) {
        this.error(2); if (frozen===0) this.unlock(mutex,0x14257b7b8n); return 0n;
      }
      this.put(header,heap?1n:0n);
      const converted=this.at(this.at(header,8n),this.q(this.at(state,0x40n)));
      let result=0;
      if (this.take(this.helper.convertPath(path,converted)) !== 0n) {
        if (this.byte(converted)===0) {
          this.memory.writeDword(this.at(output,0x20n),1);
          this.memory.writeDword(this.at(output,0x24n),this.q(this.at(state,0x10n))===0n?1:0);
          result=1;
        } else {
          let mount=this.q(mountHead), resolved=false;
          if (mount!==0n) {
            const tlsEntry=this.tlsEntry();
            while (mount!==0n && !resolved) {
              this.put(workspace.pathPointer,converted);
              if (this.ancestor(mount,converted)!==0n) {
                this.memory.writeDword(this.at(output,0x20n),1); this.memory.writeDword(this.at(output,0x24n),1);
                result=1; resolved=true;
              } else if (this.take(this.helper.acceptMountPath(mount,workspace.pathPointer,0,workspace.stat))!==0n) {
                const target=this.q(this.at(this.q(this.at(mount,0x28n)),0x68n));
                if (!this.dependencies.stat) return this.required('provider-stat',target,0x14257b744n);
                result=this.dependencies.stat(target,this.q(mount),this.q(workspace.pathPointer),output)|0;
                resolved=result!==0 || this.int(this.at(this.q(tlsEntry),0x20e4n))!==11;
              }
              mount=this.q(this.at(mount,0x30n));
            }
          }
        }
      }
      if (frozen===0) this.unlock(mutex,0x14257b775n);
      if (this.q(header)!==0n) this.free(header,0x14257b784n);
      return BigInt(result);
    });
  }
}
