import type { BufferAttribute, InstancedMesh } from 'three';

/** A bounded, dense set of instances keyed by world identity. Keep an instance each
 * visit, write it only when new/moving, then release anything that left the window.
 * Compaction moves existing buffer data, never reconstructs geometry or transforms. */
export class RetainedInstances {
  private readonly slots = new Map<number, number>();
  private readonly keys: Float64Array;
  private readonly seen: Uint32Array;
  private epoch = 0;
  private count = 0;
  private readonly matrixDirty: Uint8Array;
  private readonly colorDirty: Uint8Array;
  private readonly matrixRanges: { start: number; count: number }[] = [];
  private readonly colorRanges: { start: number; count: number }[] = [];
  fresh = false;

  constructor(private readonly mesh: InstancedMesh) {
    this.keys = new Float64Array(mesh.instanceMatrix.count);
    this.seen = new Uint32Array(this.keys.length);
    this.matrixDirty = new Uint8Array(this.keys.length);
    this.colorDirty = new Uint8Array(this.keys.length);
  }

  begin(): void {
    this.epoch = (this.epoch + 1) >>> 0;
    if (!this.epoch) { this.seen.fill(0); this.epoch = 1; }
  }

  has(key: number): boolean { return this.slots.has(key); }

  keep(key: number): number {
    let slot = this.slots.get(key);
    this.fresh = slot === undefined;
    if (slot === undefined) {
      if (this.count === this.keys.length) return -1;
      slot = this.count++;
      this.slots.set(key, slot);
      this.keys[slot] = key;
    }
    this.seen[slot] = this.epoch;
    return slot;
  }

  changed(slot: number, color = false): void {
    this.matrixDirty[slot] = 1;
    if (color) this.colorDirty[slot] = 1;
  }

  end(): void {
    for (let slot = 0; slot < this.count;) {
      if (this.seen[slot] === this.epoch) { slot++; continue; }
      this.slots.delete(this.keys[slot]);
      const last = --this.count;
      if (slot !== last) {
        this.mesh.instanceMatrix.array.copyWithin(slot * 16, last * 16, (last + 1) * 16);
        this.mesh.instanceColor?.array.copyWithin(slot * 3, last * 3, (last + 1) * 3);
        this.keys[slot] = this.keys[last];
        this.seen[slot] = this.seen[last];
        this.slots.set(this.keys[slot], slot);
        this.changed(slot, !!this.mesh.instanceColor);
      }
    }
    this.mesh.count = this.count;
    this.mesh.visible = this.count > 0;
    this.upload(this.mesh.instanceMatrix, this.matrixDirty, 16, this.matrixRanges);
    if (this.mesh.instanceColor) this.upload(this.mesh.instanceColor, this.colorDirty, 3, this.colorRanges);
  }

  reset(): void {
    this.slots.clear();
    this.count = 0;
  }

  private upload(attribute: BufferAttribute, dirty: Uint8Array, size: number, ranges: { start: number; count: number }[]): void {
    let n = 0;
    for (let i = 0; i < this.count;) {
      if (!dirty[i]) { i++; continue; }
      const start = i++;
      while (i < this.count && dirty[i]) i++;
      if (!n) attribute.clearUpdateRanges();
      const range = ranges[n] ?? (ranges[n] = { start: 0, count: 0 });
      range.start = start * size;
      range.count = (i - start) * size;
      attribute.updateRanges.push(range);
      n++;
    }
    if (n) attribute.needsUpdate = true;
    dirty.fill(0);
  }
}
