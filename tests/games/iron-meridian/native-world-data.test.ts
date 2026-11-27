import { describe, expect, it } from 'vitest';
import {
  clausewitzAssignments, ingestRawWorld, parseAuthoredState, parseClausewitz,
  parseProvinceBitmap, parseProvinceDefinitions, provinceAtPixel, UNKNOWN_PROVINCE,
} from '../../../src/games/iron-meridian/native/world-data';

function bmp(rows: number[][], bottomUp = true): Uint8Array {
  const height = rows.length;
  const width = rows[0].length;
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bytes = new Uint8Array(54 + height * stride);
  const view = new DataView(bytes.buffer);
  bytes.set([0x42, 0x4d]);
  view.setUint32(2, bytes.length, true); view.setUint32(10, 54, true); view.setUint32(14, 40, true);
  view.setInt32(18, width, true); view.setInt32(22, bottomUp ? height : -height, true);
  view.setUint16(26, 1, true); view.setUint16(28, 24, true); view.setUint32(34, stride * height, true);
  rows.forEach((row, y) => row.forEach((color, x) => {
    const offset = 54 + (bottomUp ? height - 1 - y : y) * stride + x * 3;
    bytes.set([color & 255, (color >>> 8) & 255, color >>> 16], offset);
  }));
  return bytes;
}

const definition = '0;0;0;0;land;false;unknown;0\n3838;230;81;119;land;true;plains;1\n9851;0;0;55;land;false;forest;1\n4;0;0;232;sea;true;ocean;0\n';
const state = 'state={ id=1 name="STATE_1" provinces={3838 9851} history={owner=FRA add_core_of=COR add_core_of=FRA 1939.1.1={owner=GER}} }';

describe('ordered Clausewitz syntax adapter', () => {
  it('retains repeated keys, nested dated blocks, comments, quoted delimiters and operators', () => {
    const tree = parseClausewitz('\uFEFF# head\nstate={ id=1 name="a # { = \\"word\\"" provinces={3838 9851} history={ add_core_of=COR add_core_of=FRA 1939.1.1={value>=-2} } optional ?= yes }');
    const block = clausewitzAssignments(tree, 'state')[0].value;
    expect(block.kind).toBe('block');
    if (block.kind !== 'block') throw new Error('Missing block');
    expect(clausewitzAssignments(block, 'name')[0].value).toMatchObject({ text: 'a # { = "word"', quoted: true });
    const history = clausewitzAssignments(block, 'history')[0].value;
    if (history.kind !== 'block') throw new Error('Missing history');
    expect(clausewitzAssignments(history, 'add_core_of').map(entry => entry.value)).toMatchObject([{ text: 'COR' }, { text: 'FRA' }]);
    expect(clausewitzAssignments(block, 'optional')[0].operator).toBe('?=');
    const dated = clausewitzAssignments(history, '1939.1.1')[0].value;
    if (dated.kind !== 'block') throw new Error('Missing date');
    expect(clausewitzAssignments(dated, 'value')[0]).toMatchObject({ operator: '>=', value: { text: '-2' } });
  });

  it.each(['state={id=1', 'state="unterminated', 'state={id=}', 'state={id!=}', '}', 'x!y'])('rejects malformed syntax: %s', text => {
    expect(() => parseClausewitz(text, 'bad.txt')).toThrow(/bad.txt:\d+:\d+:/);
  });

  it('does not evaluate repeated or dated owner declarations when extracting state associations', () => {
    const parsed = parseAuthoredState(state, '1-France.txt');
    expect(parsed).toMatchObject({ id: 1, name: 'STATE_1', provinceIds: [3838, 9851], source: '1-France.txt' });
    expect(clausewitzAssignments(parsed.document, 'state')).toHaveLength(1);
  });

  it.each([
    'state={id=1 id=2 name=x provinces={3838}}',
    'state={id=1 name=x provinces={"3838"}}',
    'state={id=1 name=x provinces={id=3838}}',
    'state={id=1 name=x provinces={}}',
  ])('rejects ambiguous or malformed state identity/list: %s', text => {
    expect(() => parseAuthoredState(text, 'bad-state')).toThrow(/bad-state/);
  });
});

describe('province ID/RGB/BMP ingestion', () => {
  it('retains sparse authored IDs and RGB channels without positional renumbering', () => {
    expect(parseProvinceDefinitions(definition)[1]).toMatchObject({ id: 3838, rgb: [230, 81, 119], rgbKey: 0xe65177, type: 'land', coastal: true });
  });

  it.each([
    '1;256;0;0;land;false;plains;1',
    '1;1;0;0;land;maybe;plains;1',
    '1;1;0;0;land;false;plains',
    '1;1;0;0;land;false;plains;1\n1;2;0;0;land;false;plains;1',
    '1;1;0;0;land;false;plains;1\n2;1;0;0;land;false;plains;1',
  ])('rejects invalid channels/fields or colliding identifiers/colors: %s', text => {
    expect(() => parseProvinceDefinitions(text)).toThrow();
  });

  it.each([true, false])('joins exact padded BMP pixels with state IDs, bottomUp=%s', bottomUp => {
    const world = ingestRawWorld(definition, bmp([[0xe65177, 55, 232], [232, 55, 0xe65177]], bottomUp), [{ source: '1-France.txt', text: state }]);
    expect([...world.provinceIds]).toEqual([3838, 9851, 4, 4, 9851, 3838]);
    expect(world.stateByProvinceId.get(3838)).toBe(1);
    expect(world.pixelsByProvinceId.get(3838)).toEqual({ count: 2, minX: 0, maxX: 2, minY: 0, maxY: 1 });
    expect(provinceAtPixel(world, 0, 0)?.rgb).toEqual([230, 81, 119]);
    expect(provinceAtPixel(world, -1, 0)).toBeUndefined();
    expect(provinceAtPixel(world, 0.5, 0)).toBeUndefined();
    expect(provinceAtPixel(world, 3, 0)).toBeUndefined();
    expect(world.issues.filter(issue => issue.severity === 'error')).toEqual([]);
    expect(world.issues).toContainEqual({ severity: 'warning', code: 'definition-without-pixels', detail: 'Province 0' });
  });

  it('distinguishes unknown RGB from province zero and reports its exact first source pixel', () => {
    const world = ingestRawWorld(definition, bmp([[0, 0xffffff, 0xffffff]]), [{ source: 'state', text: state }]);
    expect([...world.provinceIds]).toEqual([0, UNKNOWN_PROVINCE, UNKNOWN_PROVINCE]);
    expect(world.unknownColors).toEqual([{ rgbKey: 0xffffff, count: 2, firstX: 1, firstY: 0 }]);
    expect(provinceAtPixel(world, 1, 0)).toBeUndefined();
  });

  it('reports conflicting state membership, duplicate IDs and missing references', () => {
    const world = ingestRawWorld(definition, bmp([[0xe65177, 55, 232]]), [
      { source: 'a', text: state },
      { source: 'b', text: 'state={id=2 name=b provinces={3838 3838 4 999}}' },
      { source: 'c', text: 'state={id=2 name=c provinces={9851}}' },
      { source: 'broken', text: 'state={' },
    ]);
    expect(world.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'province-multiple-states', 'duplicate-state-province',
      'invalid-state-province', 'duplicate-state-id', 'state-parse-error',
    ]));
    expect(world.stateByProvinceId.get(3838)).toBeUndefined();
    expect(world.stateByProvinceId.get(4)).toBeUndefined();
  });

  it('preserves authored lake membership, as present in installed base state files', () => {
    const lakeDefinition = definition + '1;230;0;0;lake;false;lakes;7\n';
    const world = ingestRawWorld(lakeDefinition, bmp([[0xe65177, 55, 232, 0xe60000]]), [
      { source: 'state-with-lake', text: state.replace('3838 9851', '3838 9851 1') },
    ]);
    expect(world.stateByProvinceId.get(1)).toBe(1);
    expect(world.provinceById.get(1)?.type).toBe('lake');
    expect(world.issues.filter(issue => issue.severity === 'error')).toEqual([]);
  });

  it('rejects truncated pixels, overlapping headers and unsupported BMP compression', () => {
    const original = bmp([[55]]);
    expect(() => parseProvinceBitmap(original.subarray(0, original.length - 1))).toThrow(/file size/);
    const compressed = original.slice();
    new DataView(compressed.buffer).setUint32(30, 1, true);
    expect(() => parseProvinceBitmap(compressed)).toThrow(/BI_RGB/);
    const overlapping = original.slice();
    new DataView(overlapping.buffer).setUint32(10, 20, true);
    expect(() => parseProvinceBitmap(overlapping)).toThrow(/overlapping/);
    const shortPayload = original.slice();
    new DataView(shortPayload.buffer).setInt32(22, 2, true);
    expect(() => parseProvinceBitmap(shortPayload)).toThrow(/Truncated/);
  });
});
