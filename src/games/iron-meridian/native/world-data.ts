/** New shipped-content adapter, not a recovered native parser or effective-load resolver. */
export interface ClausewitzScalar {
  kind: 'scalar';
  text: string;
  raw: string;
  quoted: boolean;
  offset: number;
}

export interface ClausewitzBlock { kind: 'block'; entries: ClausewitzEntry[]; offset: number }
export type ClausewitzValue = ClausewitzScalar | ClausewitzBlock;
export type ClausewitzEntry =
  | { kind: 'assignment'; key: ClausewitzScalar; operator: string; value: ClausewitzValue }
  | { kind: 'value'; value: ClausewitzValue };

interface Token { kind: 'scalar' | 'operator' | '{' | '}' | 'eof'; raw: string; text: string; quoted: boolean; offset: number }

/** Ordered syntax tree: repeated keys, lists, operators and nested blocks remain distinct. */
export function parseClausewitz(text: string, source = '<input>'): ClausewitzBlock {
  let cursor = 0;
  const fail = (message: string, offset: number): never => {
    const prefix = text.slice(0, offset);
    const line = prefix.split('\n').length;
    const column = offset - prefix.lastIndexOf('\n');
    throw new Error(`${source}:${line}:${column}: ${message}`);
  };
  const next = (): Token => {
    while (cursor < text.length) {
      if (/\s|\uFEFF/.test(text[cursor])) { cursor++; continue; }
      if (text[cursor] === '#') {
        while (cursor < text.length && text[cursor] !== '\n') cursor++;
        continue;
      }
      break;
    }
    const offset = cursor;
    if (cursor === text.length) return { kind: 'eof', raw: '', text: '', quoted: false, offset };
    const char = text[cursor++];
    if (char === '{' || char === '}') return { kind: char, raw: char, text: char, quoted: false, offset };
    if (char === '"') {
      let value = '';
      while (cursor < text.length) {
        const current = text[cursor++];
        if (current === '"') return { kind: 'scalar', raw: text.slice(offset, cursor), text: value, quoted: true, offset };
        if (current === '\\') {
          if (cursor === text.length) fail('Unterminated quoted string', offset);
          const escaped = text[cursor++];
          // Preserve unknown escape pairs; no native string-evaluation semantics are assumed.
          value += escaped === '"' || escaped === '\\' ? escaped : `\\${escaped}`;
        } else value += current;
      }
      return fail('Unterminated quoted string', offset);
    }
    if ('=<>!?'.includes(char) || ('+-*/%'.includes(char) && text[cursor] === '=')) {
      if (text[cursor] === '=') cursor++;
      const operator = text.slice(offset, cursor);
      if (!['=', '==', '!=', '<', '>', '<=', '>=', '?=', '+=', '-=', '*=', '/=', '%='].includes(operator)) {
        fail(`Unsupported operator ${operator}`, offset);
      }
      return { kind: 'operator', raw: operator, text: operator, quoted: false, offset };
    }
    while (cursor < text.length && !/[\s\uFEFF{}#"=<>!?]/.test(text[cursor])) {
      if ('+-*/%'.includes(text[cursor]) && text[cursor + 1] === '=') break;
      cursor++;
    }
    const raw = text.slice(offset, cursor);
    return { kind: 'scalar', raw, text: raw, quoted: false, offset };
  };
  let token = next();
  const advance = () => { const previous = token; token = next(); return previous; };
  const value = (depth: number): ClausewitzValue => {
    if (token.kind === 'scalar') return { ...advance(), kind: 'scalar' };
    if (token.kind === '{') {
      const opening = advance();
      const block = entries(depth + 1, opening.offset);
      if (token.kind as string !== '}') fail('Unterminated block', opening.offset);
      advance();
      return block;
    }
    return fail('Expected scalar or block', token.offset);
  };
  const entries = (depth: number, offset: number): ClausewitzBlock => {
    if (depth > 512) fail('Parser nesting limit exceeded (512)', offset);
    const result: ClausewitzBlock = { kind: 'block', entries: [], offset };
    while (token.kind !== 'eof' && token.kind !== '}') {
      const first = value(depth);
      if (token.kind as string === 'operator') {
        if (first.kind !== 'scalar') fail('Assignment key must be a scalar', first.offset);
        const operator = advance().text;
        result.entries.push({ kind: 'assignment', key: first as ClausewitzScalar, operator, value: value(depth) });
      } else result.entries.push({ kind: 'value', value: first });
    }
    return result;
  };
  const root = entries(0, 0);
  if (token.kind !== 'eof') fail('Unexpected closing brace', token.offset);
  return root;
}

export function clausewitzAssignments(block: ClausewitzBlock, key: string) {
  return block.entries.filter((entry): entry is Extract<ClausewitzEntry, { kind: 'assignment' }> =>
    entry.kind === 'assignment' && entry.key.text === key);
}

function requiredField(block: ClausewitzBlock, key: string, kind: ClausewitzValue['kind'], source: string): ClausewitzValue {
  const matches = clausewitzAssignments(block, key);
  if (matches.length !== 1 || matches[0].operator !== '=' || matches[0].value.kind !== kind) {
    throw new Error(`${source}: Expected exactly one ${key} = ${kind}`);
  }
  return matches[0].value;
}

function unsignedInteger(raw: string, source: string, maximum = 0xFFFFFFFE): number {
  if (!/^\d+$/.test(raw)) throw new Error(`${source}: Expected unsigned integer, got ${raw}`);
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value > maximum) throw new Error(`${source}: Integer out of range: ${raw}`);
  return value;
}

export interface ProvinceDefinition {
  id: number;
  rgb: readonly [number, number, number];
  rgbKey: number;
  type: 'land' | 'sea' | 'lake';
  coastal: boolean;
  terrain: string;
  continent: number;
  line: number;
}

export function parseProvinceDefinitions(text: string, source = 'definition.csv'): ProvinceDefinition[] {
  const provinces: ProvinceDefinition[] = [];
  const ids = new Set<number>();
  const colors = new Set<number>();
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  lines.forEach((line, index) => {
    const content = line.split('#', 1)[0].trim();
    if (!content) return;
    const fields = content.split(';').map(field => field.trim());
    const location = `${source}:${index + 1}`;
    if (fields.length !== 8) throw new Error(`${location}: Expected eight semicolon-separated fields`);
    const [rawId, red, green, blue, type, coastal, terrain, continent] = fields;
    const id = unsignedInteger(rawId, location);
    const rgb = [red, green, blue].map(value => unsignedInteger(value, location, 255)) as [number, number, number];
    const rgbKey = rgb[0] * 65536 + rgb[1] * 256 + rgb[2];
    if (ids.has(id)) throw new Error(`${location}: Duplicate province ID ${id}`);
    if (colors.has(rgbKey)) throw new Error(`${location}: Duplicate RGB ${rgb.join(',')}`);
    if (type !== 'land' && type !== 'sea' && type !== 'lake') throw new Error(`${location}: Unknown province type ${type}`);
    if (coastal !== 'true' && coastal !== 'false') throw new Error(`${location}: Invalid coastal flag ${coastal}`);
    if (!terrain) throw new Error(`${location}: Missing terrain`);
    ids.add(id); colors.add(rgbKey);
    provinces.push({ id, rgb, rgbKey, type, coastal: coastal === 'true', terrain, continent: unsignedInteger(continent, location), line: index + 1 });
  });
  if (!provinces.length) throw new Error(`${source}: Empty province definition table`);
  return provinces;
}

export interface ProvinceBitmap {
  width: number;
  height: number;
  rowStride: number;
  pixelOffset: number;
  bottomUp: boolean;
  bytes: Uint8Array;
}

/** Supports the observed uncompressed 24-bit BMP format; rejects unsupported encodings. */
export function parseProvinceBitmap(bytes: Uint8Array): ProvinceBitmap {
  const fail = (reason: string): never => { throw new Error(`provinces.bmp: ${reason}`); };
  if (bytes.length < 54) fail('Truncated BMP header');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(0, true) !== 0x4D42) fail('Missing BM signature');
  if (view.getUint32(2, true) !== bytes.length) fail('Declared file size differs from supplied bytes');
  const pixelOffset = view.getUint32(10, true);
  const dibSize = view.getUint32(14, true);
  if (dibSize < 40 || 14 + dibSize > bytes.length) fail('Unsupported or truncated DIB header');
  const width = view.getInt32(18, true);
  const signedHeight = view.getInt32(22, true);
  if (width <= 0 || signedHeight === 0 || signedHeight === -2147483648) fail('Invalid bitmap dimensions');
  if (view.getUint16(26, true) !== 1 || view.getUint16(28, true) !== 24 || view.getUint32(30, true) !== 0) {
    fail('Expected one-plane 24-bit BI_RGB bitmap');
  }
  const height = Math.abs(signedHeight);
  const rowStride = Math.ceil(width * 3 / 4) * 4;
  if (pixelOffset < 14 + dibSize || pixelOffset + rowStride * height > bytes.length) fail('Truncated or overlapping pixel payload');
  const imageSize = view.getUint32(34, true);
  if (imageSize !== 0 && imageSize !== rowStride * height) fail('Declared image size differs from row payload');
  return { width, height, rowStride, pixelOffset, bottomUp: signedHeight > 0, bytes };
}

export interface AuthoredState {
  id: number;
  name: string;
  provinceIds: number[];
  source: string;
  /** Syntax only. Date conditions, owner effects and script evaluation are not executed. */
  document: ClausewitzBlock;
}

export function parseAuthoredState(text: string, source: string): AuthoredState {
  const document = parseClausewitz(text, source);
  const state = requiredField(document, 'state', 'block', source) as ClausewitzBlock;
  const id = unsignedInteger((requiredField(state, 'id', 'scalar', source) as ClausewitzScalar).text, source);
  if (id === 0) throw new Error(`${source}: State ID zero is not supported`);
  const name = (requiredField(state, 'name', 'scalar', source) as ClausewitzScalar).text;
  const provinces = requiredField(state, 'provinces', 'block', source) as ClausewitzBlock;
  const provinceIds = provinces.entries.map(entry => {
    if (entry.kind !== 'value' || entry.value.kind !== 'scalar' || entry.value.quoted) throw new Error(`${source}: provinces must contain unquoted integer values`);
    return unsignedInteger(entry.value.text, source);
  });
  if (!provinceIds.length) throw new Error(`${source}: Empty province association`);
  return { id, name, provinceIds, source, document };
}

export interface WorldIssue { severity: 'error' | 'warning'; code: string; detail: string }
export interface ProvincePixels { count: number; minX: number; minY: number; maxX: number; maxY: number }
export const UNKNOWN_PROVINCE = 0xFFFFFFFF;

export interface RawWorldData {
  scope: 'raw-base-files';
  definitions: ProvinceDefinition[];
  states: AuthoredState[];
  width: number;
  height: number;
  /** Row-major, top-left origin. Exact source pixels, with no resampling. */
  provinceIds: Uint32Array;
  provinceById: Map<number, ProvinceDefinition>;
  /** Contains only unambiguous associations whose state ID is unique across source files. */
  stateByProvinceId: Map<number, number>;
  pixelsByProvinceId: Map<number, ProvincePixels>;
  unknownColors: { rgbKey: number; count: number; firstX: number; firstY: number }[];
  issues: WorldIssue[];
}

/** Joins base declarations only. It never resolves DLC/mod overrides or runs history scripts. */
export function ingestRawWorld(
  definitionText: string,
  bitmapBytes: Uint8Array,
  stateFiles: readonly { source: string; text: string }[],
): RawWorldData {
  const definitions = parseProvinceDefinitions(definitionText);
  const bitmap = parseProvinceBitmap(bitmapBytes);
  const provinceById = new Map(definitions.map(province => [province.id, province]));
  const provinceByColor = new Map(definitions.map(province => [province.rgbKey, province.id]));
  const provinceIds = new Uint32Array(bitmap.width * bitmap.height);
  const pixelsByProvinceId = new Map<number, ProvincePixels>();
  const unknownColors = new Map<number, { rgbKey: number; count: number; firstX: number; firstY: number }>();
  const issues: WorldIssue[] = [];
  for (let y = 0; y < bitmap.height; y++) {
    const row = bitmap.pixelOffset + (bitmap.bottomUp ? bitmap.height - 1 - y : y) * bitmap.rowStride;
    for (let x = 0; x < bitmap.width; x++) {
      const offset = row + x * 3;
      const rgbKey = bitmap.bytes[offset + 2] * 65536 + bitmap.bytes[offset + 1] * 256 + bitmap.bytes[offset];
      const id = provinceByColor.get(rgbKey);
      provinceIds[y * bitmap.width + x] = id ?? UNKNOWN_PROVINCE;
      if (id === undefined) {
        const unknown = unknownColors.get(rgbKey);
        if (unknown) unknown.count++;
        else unknownColors.set(rgbKey, { rgbKey, count: 1, firstX: x, firstY: y });
        continue;
      }
      const pixels = pixelsByProvinceId.get(id);
      if (pixels) {
        pixels.count++; pixels.minX = Math.min(pixels.minX, x); pixels.maxX = Math.max(pixels.maxX, x);
        pixels.minY = Math.min(pixels.minY, y); pixels.maxY = Math.max(pixels.maxY, y);
      } else pixelsByProvinceId.set(id, { count: 1, minX: x, minY: y, maxX: x, maxY: y });
    }
  }
  for (const unknown of unknownColors.values()) issues.push({ severity: 'error', code: 'unknown-pixel-color', detail: `RGB #${unknown.rgbKey.toString(16).padStart(6, '0')}: ${unknown.count} pixels, first (${unknown.firstX},${unknown.firstY})` });
  const states: AuthoredState[] = [];
  const stateById = new Map<number, AuthoredState>();
  const duplicateStateIds = new Set<number>();
  const stateCandidatesByProvince = new Map<number, Set<number>>();
  const stateByProvinceId = new Map<number, number>();
  for (const file of stateFiles) {
    let state: AuthoredState;
    try { state = parseAuthoredState(file.text, file.source); }
    catch (error) { issues.push({ severity: 'error', code: 'state-parse-error', detail: String(error) }); continue; }
    states.push(state);
    const previous = stateById.get(state.id);
    if (previous) {
      duplicateStateIds.add(state.id);
      issues.push({ severity: 'error', code: 'duplicate-state-id', detail: `State ${state.id}: ${previous.source}, ${state.source}` });
    }
    else stateById.set(state.id, state);
    const seen = new Set<number>();
    for (const provinceId of state.provinceIds) {
      if (seen.has(provinceId)) issues.push({ severity: 'error', code: 'duplicate-state-province', detail: `${state.source}: repeated province ${provinceId}` });
      seen.add(provinceId);
      const province = provinceById.get(provinceId);
      if (!province || provinceId === 0) {
        issues.push({ severity: 'error', code: 'invalid-state-province', detail: `${state.source}: province ${provinceId}` }); continue;
      }
      // The shipped base files assign lake provinces to states. Preserve the authored
      // relationship for every declared type instead of imposing land-only semantics.
      let candidates = stateCandidatesByProvince.get(provinceId);
      if (!candidates) { candidates = new Set(); stateCandidatesByProvince.set(provinceId, candidates); }
      candidates.add(state.id);
    }
  }
  for (const [provinceId, candidates] of stateCandidatesByProvince) {
    if (candidates.size > 1) issues.push({ severity: 'error', code: 'province-multiple-states', detail: `Province ${provinceId}: states ${[...candidates].join(', ')}` });
    else {
      const [stateId] = candidates;
      if (!duplicateStateIds.has(stateId)) stateByProvinceId.set(provinceId, stateId);
    }
  }
  for (const province of definitions) {
    if (!pixelsByProvinceId.has(province.id)) issues.push({ severity: 'warning', code: 'definition-without-pixels', detail: `Province ${province.id}` });
    if (province.id !== 0 && province.type === 'land' && !stateCandidatesByProvince.has(province.id)) {
      issues.push({ severity: 'error', code: 'land-without-state', detail: `Province ${province.id}` });
    }
  }
  return { scope: 'raw-base-files', definitions, states, width: bitmap.width, height: bitmap.height, provinceIds, provinceById, stateByProvinceId, pixelsByProvinceId, unknownColors: [...unknownColors.values()], issues };
}

/** Concrete renderer/hit-test adapter using integer source-pixel coordinates. No wrap or scaling is assumed. */
export function provinceAtPixel(world: RawWorldData, x: number, y: number): ProvinceDefinition | undefined {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= world.width || y >= world.height) return undefined;
  return world.provinceById.get(world.provinceIds[y * world.width + x]);
}
