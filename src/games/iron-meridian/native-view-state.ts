import type { NativeMapCamera } from './native-map-view';

export interface NativeViewSave {
  kind: 'iron-meridian-native-view';
  version: 1;
  snapshotId: string;
  camera: NativeMapCamera;
  legacyPrototypeSave?: unknown;
}

/** Only view metadata is saved. Selected game content stays out of account storage. */
export function readNativeViewSave(data: unknown): NativeViewSave | undefined {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return;
  const save = data as Partial<NativeViewSave>;
  if (save.kind !== 'iron-meridian-native-view' || save.version !== 1
    || typeof save.snapshotId !== 'string' || !/^[a-f0-9]{64}$/.test(save.snapshotId)
    || !save.camera || typeof save.camera !== 'object' || Array.isArray(save.camera)
    || ![save.camera.x, save.camera.y, save.camera.zoom].every(value => typeof value === 'number' && Number.isFinite(value))
    || save.camera.zoom < 1) return;
  return {
    kind: save.kind, version: save.version, snapshotId: save.snapshotId,
    camera: { x: save.camera.x, y: save.camera.y, zoom: save.camera.zoom },
    ...('legacyPrototypeSave' in save ? { legacyPrototypeSave: save.legacyPrototypeSave } : {}),
  };
}
