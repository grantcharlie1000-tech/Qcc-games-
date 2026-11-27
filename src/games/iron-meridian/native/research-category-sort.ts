import type { ResearchConstructionMemory } from './research-construction';

export interface ResearchCategorySortServices {
  allocate?(input: { target: bigint; size: bigint; descriptor: bigint }): bigint;
  release?(input: { target: bigint; pointer: bigint }): void;
}
export type ResearchCategorySortResult = { kind: 'returned' }
  | { kind: 'runtime-required'; boundary: 'sort-allocate' | 'sort-release'; nativeAddress: bigint };
class SortStop extends Error {
  constructor(readonly result: Extract<ResearchCategorySortResult, { kind: 'runtime-required' }>) { super(result.boundary); }
}
const u64 = (value: bigint) => BigInt.asUintN(64, value);
const at = (pointer: bigint, offset: bigint) => u64(pointer + offset);

/** Original 45B190 and direct pointer-sort closure over a valid native vector. */
export function sortResearchCategoryPointers(memory: ResearchConstructionMemory, header: bigint, entryStack: bigint, services: ResearchCategorySortServices = {}): ResearchCategorySortResult {
  const q = (address: bigint) => u64(memory.readQword(u64(address)));
  const wq = (address: bigint, value: bigint) => memory.writeQword(u64(address), u64(value));
  const wb = (address: bigint, value: number) => memory.writeByte(u64(address), value);
  function stop(boundary: 'sort-allocate' | 'sort-release', nativeAddress: bigint): never { throw new SortStop({ kind: 'runtime-required', boundary, nativeAddress }); }
  function copy(destination: bigint, source: bigint, size: bigint) {
    if (size !== 0n) memory.writeBytes(u64(destination), Uint8Array.from({ length: Number(size) }, (_, index) => memory.readByte(at(source, BigInt(index)))));
  }
  function insertion(begin: bigint, end: bigint) {
    if (begin === end) return;
    for (let current = at(begin, 8n); current !== end; current = at(current, 8n)) {
      const value = q(current);
      if (value < q(begin)) { copy(at(begin, 8n), begin, u64(current - begin)); wq(begin, value); }
      else { let position = current, previous = q(at(position, -8n)); while (value < previous) { wq(position, previous); previous = q(at(position, -16n)); position = at(position, -8n); } wq(position, value); }
    }
  }
  function mergePass(begin: bigint, end: bigint, output: bigint, width: bigint, remaining: bigint) {
    while (remaining > width) {
      remaining -= width; const middle = at(begin, width * 8n), rightCount = remaining < width ? remaining : width;
      remaining -= rightCount; const limit = at(middle, rightCount * 8n); let right = middle;
      for (;;) {
        const other = q(right), next = at(output, 8n), value = q(begin);
        if (other < value) { right = at(right, 8n); wq(output, other); if (right === limit) { const bytes = u64(middle - begin); copy(next, begin, bytes); output = at(next, bytes); break; } }
        else { begin = at(begin, 8n); wq(output, value); if (begin === middle) { const bytes = u64(limit - right); copy(next, right, bytes); output = at(next, bytes); break; } }
        output = next;
      }
      begin = limit;
    }
    copy(output, begin, u64(end - begin));
  }
  function sortBlocks(begin: bigint, end: bigint, count: bigint, scratch: bigint, stack: bigint) {
    wq(at(stack, 0x10n), end);
    const frame = at(stack, -0x58n);
    let tail = begin;
    if (count > 32n) {
      let blocks = (count - 33n >> 5n) + 1n;
      while (blocks-- !== 0n) { insertion(tail, at(tail, 256n)); tail = at(tail, 256n); }
    }
    insertion(tail, end); if (count < 33n) return;
    mergePass(begin, end, scratch, 32n, count);
    wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), count);
    mergePass(scratch, at(scratch, count * 8n), begin, 64n, count);
    for (let width = 128n; width < count; width *= 4n) {
      wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), count);
      mergePass(begin, end, scratch, width, count);
      wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), count);
      mergePass(scratch, at(scratch, count * 8n), begin, width * 2n, count);
    }
  }
  function reverse(begin: bigint, end: bigint) {
    function chunks(size: bigint) {
      const stopAt = at(begin, u64(end - begin) >> 1n & -size);
      do {
        const left = Array.from({ length: Number(size / 8n) }, (_, index) => q(at(begin, BigInt(index) * 8n)));
        end = at(end, -size);
        const right = Array.from({ length: Number(size / 8n) }, (_, index) => q(at(end, BigInt(index) * 8n)));
        memory.writeBytes(begin, Uint8Array.from(right.reverse().flatMap(value => Array.from({ length: 8 }, (_, i) => Number(value >> BigInt(i * 8) & 255n)))));
        begin = at(begin, size);
        memory.writeBytes(end, Uint8Array.from(left.reverse().flatMap(value => Array.from({ length: 8 }, (_, i) => Number(value >> BigInt(i * 8) & 255n)))));
      } while (begin !== stopAt);
    }
    if (u64(end - begin) > 63n && (memory.readDword(0x14313ffacn) & 32)) chunks(32n);
    if (u64(end - begin) > 31n && (memory.readDword(0x14313ffacn) & 4)) chunks(16n);
    while (begin !== end) { end = at(end, -8n); if (begin === end) return; const value = q(begin); wq(begin, q(end)); begin = at(begin, 8n); wq(end, value); }
  }
  function rotate(begin: bigint, middle: bigint, end: bigint) {
    if (begin === middle) return end; if (middle === end) return begin;
    reverse(begin, middle); reverse(middle, end); reverse(begin, end); return at(begin, u64(end - middle));
  }
  function splitMerge(begin: bigint, middle: bigint, end: bigint, leftCount: bigint, rightCount: bigint, scratch: bigint, capacity: bigint, leftSplit: bigint, rightSplit: bigint, leftPrefix: bigint, rightPrefix: bigint, stack: bigint) {
    wq(at(stack, 0x18n), end); wq(at(stack, 8n), begin);
    const frame = at(stack, -0x78n);
    const remainingLeft = leftCount - leftPrefix; let newMiddle: bigint;
    if (remainingLeft === 0n) newMiddle = rightSplit;
    else if (rightPrefix === 0n) newMiddle = leftSplit;
    else if (rightPrefix < remainingLeft || capacity < remainingLeft) {
      if (capacity < rightPrefix) newMiddle = rotate(leftSplit, middle, rightSplit);
      else { const bytes = u64(rightSplit - middle); copy(scratch, middle, bytes); copy(at(rightSplit, -u64(middle - leftSplit)), leftSplit, u64(middle - leftSplit)); copy(leftSplit, scratch, bytes); newMiddle = at(leftSplit, bytes); }
    } else { const bytes = u64(middle - leftSplit); copy(scratch, leftSplit, bytes); copy(leftSplit, middle, u64(rightSplit - middle)); newMiddle = at(leftSplit, u64(rightSplit - middle)); copy(newMiddle, scratch, bytes); }
    wb(at(frame, 0x38n), 0); wq(at(frame, 0x30n), capacity); wq(at(frame, 0x28n), scratch); wq(at(frame, 0x20n), rightPrefix);
    mergeTrimmed(begin, leftSplit, newMiddle, leftPrefix, rightPrefix, scratch, capacity, at(frame, -8n));
    wb(at(stack, 0x40n), 0); wq(at(stack, 0x38n), capacity); wq(at(stack, 0x28n), rightCount - rightPrefix);
    mergeTrimmed(newMiddle, rightSplit, end, remainingLeft, rightCount - rightPrefix, scratch, capacity, stack);
  }
  function mergeAdaptive(begin: bigint, middle: bigint, end: bigint, leftCount: bigint, rightCount: bigint, scratch: bigint, capacity: bigint, stack: bigint) {
    if (leftCount <= rightCount && leftCount <= capacity) {
      const bytes = u64(middle - begin); copy(scratch, begin, bytes); wq(begin, q(middle));
      const last = at(scratch, bytes - 8n); let right = at(middle, 8n), output = at(begin, 8n), left = scratch;
      for (;;) {
        const value = q(left), next = at(output, 8n), other = q(right);
        if (other < value) { right = at(right, 8n); wq(output, other); if (right === end) { copy(next, left, u64(at(scratch, bytes) - left)); return; } }
        else { left = at(left, 8n); wq(output, value); if (left === last) { const final = q(last); copy(next, right, u64(end - right)); wq(at(next, u64(end - right)), final); return; } }
        output = next;
      }
    }
    if (capacity >= rightCount) {
      const bytes = u64(end - middle); copy(scratch, middle, bytes);
      let left = at(middle, -8n), output = at(end, -8n), right = at(scratch, bytes - 8n); wq(output, q(left));
      for (;;) {
        left = at(left, -8n);
        for (;;) {
          const before = output, value = q(right); output = at(before, -8n);
          if (value < q(left)) break;
          right = at(right, -8n); wq(output, value);
          if (scratch === right) { const destination = at(before, -16n); wq(destination, q(left)); copy(at(destination, -u64(left - begin)), begin, u64(left - begin)); wq(begin, q(scratch)); return; }
        }
        wq(output, q(left));
        if (begin === left) { const destination = at(output, -8n); wq(destination, q(right)); copy(at(destination, -u64(right - scratch)), scratch, u64(right - scratch)); return; }
      }
    }
    let leftSplit: bigint, rightSplit: bigint, leftPrefix: bigint, rightPrefix: bigint;
    if (rightCount < leftCount) {
      rightPrefix = rightCount >> 1n; rightSplit = at(middle, rightPrefix * 8n); let remaining = u64(middle - begin) >> 3n; leftSplit = begin;
      while (remaining > 0n) { const half = remaining >> 1n; if (q(at(leftSplit, half * 8n)) <= q(rightSplit)) { leftSplit = at(leftSplit, (half + 1n) * 8n); remaining -= half + 1n; } else remaining = half; }
      leftPrefix = u64(leftSplit - begin) >> 3n;
    } else {
      leftPrefix = leftCount >> 1n; leftSplit = at(begin, leftPrefix * 8n); let remaining = u64(end - middle) >> 3n; rightSplit = middle;
      while (remaining > 0n) { const half = remaining >> 1n; if (q(at(rightSplit, half * 8n)) < q(leftSplit)) { rightSplit = at(rightSplit, (half + 1n) * 8n); remaining -= half + 1n; } else remaining = half; }
      rightPrefix = u64(rightSplit - middle) >> 3n;
    }
    const frame = at(stack, -0x78n);
    wq(at(frame, 0x58n), rightPrefix); wq(at(frame, 0x50n), leftPrefix); wq(at(frame, 0x48n), rightSplit); wq(at(frame, 0x40n), leftSplit);
    wb(at(frame, 0x38n), 0); wq(at(frame, 0x30n), capacity); wq(at(frame, 0x28n), scratch); wq(at(frame, 0x20n), rightCount);
    splitMerge(begin, middle, end, leftCount, rightCount, scratch, capacity, leftSplit, rightSplit, leftPrefix, rightPrefix, at(frame, -8n));
  }
  function mergeTrimmed(begin: bigint, middle: bigint, end: bigint, leftCount: bigint, rightCount: bigint, scratch: bigint, capacity: bigint, stack: bigint) {
    if (middle === end || begin === middle) return;
    const firstRight = q(middle); let firstLeft: bigint;
    for (;;) { firstLeft = q(begin); if (firstLeft > firstRight) break; begin = at(begin, 8n); leftCount--; if (begin === middle) return; }
    for (;;) {
      const previousEnd = end, previousRightCount = rightCount; end = at(end, -8n);
      if (middle === end) { const bytes = u64(middle - begin); copy(at(previousEnd, -bytes), begin, bytes); wq(begin, firstRight); return; }
      rightCount--;
      if (q(at(middle, -8n)) > q(end)) {
        if (leftCount === 1n) { const bytes = u64(previousEnd - middle); copy(begin, middle, bytes); wq(at(begin, bytes), firstLeft); }
        else {
          const frame = at(stack, -0x48n);
          wb(at(frame, 0x38n), 0); wq(at(frame, 0x30n), capacity); wq(at(frame, 0x28n), scratch); wq(at(frame, 0x20n), previousRightCount);
          mergeAdaptive(begin, middle, previousEnd, leftCount, previousRightCount, scratch, capacity, at(frame, -8n));
        }
        return;
      }
    }
  }
  function sortRange(begin: bigint, end: bigint, count: bigint, scratch: bigint, capacity: bigint, stack: bigint) {
    if (count < 33n) { insertion(begin, end); return; }
    const rightCount = count >> 1n, leftCount = count - rightCount, middle = at(begin, leftCount * 8n);
    const frame = at(stack, -0x68n);
    if (capacity < leftCount) {
      wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), capacity); sortRange(begin, middle, leftCount, scratch, capacity, at(frame, -8n));
      wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), capacity); sortRange(middle, end, rightCount, scratch, capacity, at(frame, -8n));
    } else {
      wb(at(frame, 0x20n), 0); sortBlocks(begin, middle, leftCount, scratch, at(frame, -8n));
      wb(at(frame, 0x20n), 0); sortBlocks(middle, end, rightCount, scratch, at(frame, -8n));
    }
    wb(at(frame, 0x38n), 0); wq(at(frame, 0x30n), capacity); wq(at(frame, 0x28n), scratch); wq(at(frame, 0x20n), rightCount);
    mergeTrimmed(begin, middle, end, leftCount, rightCount, scratch, capacity, at(frame, -8n));
  }
  try {
    const count = BigInt(memory.readDword(at(header, 0xcn)) | 0), begin = q(header), end = at(begin, count * 8n), frame = at(entryStack, -0x1048n);
    if (count < 33n) insertion(begin, end);
    else {
      let capacity = count - count / 2n, scratch = at(frame, 0x40n);
      if (capacity > 512n) {
        let allocated = 0n;
        do { if (!services.allocate) stop('sort-allocate', 0x1425a01dcn); allocated = u64(services.allocate({ target: 0x1425a01dcn, size: capacity * 8n, descriptor: 0x142c0c4f8n })); if (allocated !== 0n) break; capacity >>= 1n; } while (capacity !== 0n);
        if (allocated !== 0n && capacity > 512n) scratch = allocated;
        else { if (!services.release) stop('sort-release', 0x1425cec00n); services.release({ target: 0x1425cec00n, pointer: allocated }); capacity = 512n; }
      }
      wq(at(frame, 0x30n), scratch); wq(at(frame, 0x38n), capacity); wb(at(frame, 0x28n), 0); wq(at(frame, 0x20n), capacity);
      sortRange(begin, end, count, scratch, capacity, at(frame, -8n));
      if (q(at(frame, 0x38n)) > 512n) { if (!services.release) stop('sort-release', 0x1425cec00n); services.release({ target: 0x1425cec00n, pointer: q(at(frame, 0x30n)) }); }
    }
    return { kind: 'returned' };
  } catch (error) { if (error instanceof SortStop) return error.result; throw error; }
}
