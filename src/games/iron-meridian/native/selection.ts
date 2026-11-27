export interface NativeSelectionDiagnostic {
  readonly list: 'disabled_dlcs' | 'enabled_mods';
  readonly index: number;
  readonly kind: 'non-string-child';
}

export interface NativeSelectionDependencies {
  /** Native tolower argument in, 32-bit result out. The caller supplies the active locale. */
  foldByte(value: number): number;
}

export type NativeSelectionResult = {
  readonly kind: 'returned';
  readonly parsed: boolean;
  readonly disabledDlcs: readonly Uint8Array[];
  readonly enabledMods: readonly Uint8Array[];
  readonly diagnostics: readonly NativeSelectionDiagnostic[];
} | {
  readonly kind: 'runtime-required';
  readonly reason: 'read-beyond-c-string';
  readonly offset: number;
};

/** The proven 0x1425e1d60 fast path, requiring native global 0x143694ccc == 0. */
export function foldNativeSelectionAsciiByte(value: number): number {
  return value >= 0x41 && value <= 0x5a ? value + 0x20 : value | 0;
}

interface Node {
  readonly key: Uint8Array | null;
  readonly string: Uint8Array | null;
  readonly children: Node[];
}

class ParseFailure extends Error {}
class ReadBoundary extends Error {
  constructor(readonly offset: number) { super('Native parser reads beyond its supplied C string'); }
}

/**
 * 0x142548ec0 + 0x1425499e0 parser closure, key lookup 0x142548df0 and
 * selection extraction 0x1420e1b10. Input is the already converted C string,
 * before the parser call at 0x1420dc4c5. No filesystem or allocation failure is modeled.
 */
export function readNativeSelectionJson(input: Uint8Array, dependencies: NativeSelectionDependencies): NativeSelectionResult {
  const nul = input.indexOf(0);
  const end = nul < 0 ? input.length : nul;
  let position = 0;
  const byte = (index = position): number => {
    if (index > end) throw new ReadBoundary(index);
    return index === end ? 0 : input[index]!;
  };
  const whitespace = () => { while (byte() !== 0 && byte() <= 0x20) position++; };
  const digit = (value: number) => value >= 0x30 && value <= 0x39;
  const hex4 = (index: number): number => {
    let value = 0;
    for (let count = 0; count < 4; count++) {
      const character = byte(index + count);
      const digitValue = character >= 0x30 && character <= 0x39 ? character - 0x30
        : character >= 0x41 && character <= 0x46 ? character - 0x37
          : character >= 0x61 && character <= 0x66 ? character - 0x57 : -1;
      if (digitValue < 0) return 0;
      value = (value << 4) + digitValue;
    }
    return value;
  };
  const string = (): Uint8Array => {
    if (byte() !== 0x22) throw new ParseFailure();
    // Native first counts allocation space, skipping the byte after a backslash.
    let scan = position + 1;
    while (byte(scan) !== 0 && byte(scan) !== 0x22) scan += byte(scan) === 0x5c ? 2 : 1;
    position++;
    const output: number[] = [];
    while (byte() !== 0 && byte() !== 0x22) {
      const character = byte();
      position++;
      if (character !== 0x5c) { output.push(character); continue; }
      const escaped = byte();
      if (escaped !== 0x75) {
        output.push(escaped === 0x62 ? 8 : escaped === 0x66 ? 12 : escaped === 0x6e ? 10
          : escaped === 0x72 ? 13 : escaped === 0x74 ? 9 : escaped);
        position++;
        continue;
      }
      let codepoint = hex4(position + 1);
      position += 5;
      if (codepoint === 0 || (codepoint >= 0xdc00 && codepoint <= 0xdfff)) continue;
      if (codepoint >= 0xd800 && codepoint <= 0xdbff) {
        if (byte() !== 0x5c || byte(position + 1) !== 0x75) continue;
        const low = hex4(position + 2);
        position += 6;
        if (low < 0xdc00 || low > 0xdfff) continue;
        codepoint = 0x10000 + ((codepoint & 0x3ff) << 10) + (low & 0x3ff);
      }
      if (codepoint < 0x80) output.push(codepoint);
      else if (codepoint < 0x800) output.push(0xc0 | (codepoint >> 6), 0x80 | (codepoint & 0x3f));
      else if (codepoint < 0x10000) output.push(0xe0 | (codepoint >> 12), 0x80 | ((codepoint >> 6) & 0x3f), 0x80 | (codepoint & 0x3f));
      else output.push(0xf0 | (codepoint >> 18), 0x80 | ((codepoint >> 12) & 0x3f), 0x80 | ((codepoint >> 6) & 0x3f), 0x80 | (codepoint & 0x3f));
    }
    if (byte() === 0x22) position++;
    return Uint8Array.from(output);
  };
  // Numeric payloads are unused by selection extraction. Preserve the original
  // number scanner's consumed bytes, including '-' and exponents without digits.
  const number = () => {
    if (byte() === 0x2d) position++;
    if (byte() === 0x30) position++;
    if (byte() >= 0x31 && byte() <= 0x39) while (digit(byte())) position++;
    if (byte() === 0x2e && digit(byte(position + 1))) {
      position++;
      while (digit(byte())) position++;
    }
    if (byte() === 0x65 || byte() === 0x45) {
      position++;
      if (byte() === 0x2b || byte() === 0x2d) position++;
      while (digit(byte())) position++;
    }
  };
  const literal = (text: string): boolean => {
    for (let index = 0; index < text.length; index++) {
      // strncmp stops at a mismatching NUL without reading further bytes.
      if (byte(position + index) !== text.charCodeAt(index)) return false;
    }
    position += text.length;
    return true;
  };
  const nextObjectKey = (): Uint8Array => {
    whitespace();
    const key = string();
    whitespace();
    if (byte() !== 0x3a) throw new ParseFailure();
    position++;
    whitespace();
    return key;
  };
  const parse = (): Node => {
    const stack: { node: Node; object: boolean; close: number }[] = [];
    let key: Uint8Array | null = null;
    whitespace();
    while (true) {
      let node: Node = { key, string: null, children: [] };
      const character = byte();
      if (literal('null') || literal('false') || literal('true')) { /* No string payload. */ }
      else if (character === 0x22) node = { ...node, string: string() };
      else if (character === 0x2d || digit(character)) number();
      else if (character === 0x5b || character === 0x7b) {
        const object = character === 0x7b;
        const close = object ? 0x7d : 0x5d;
        position++;
        whitespace();
        if (byte() !== close) {
          stack.push({ node, object, close });
          key = object ? nextObjectKey() : null;
          continue;
        }
        position++;
      }
      else throw new ParseFailure();

      while (true) {
        const frame = stack.at(-1);
        if (!frame) return node; // Native root parser accepts trailing bytes.
        frame.node.children.push(node);
        whitespace();
        if (byte() === 0x2c) {
          position++;
          whitespace();
          key = frame.object ? nextObjectKey() : null;
          break;
        }
        if (byte() !== frame.close) throw new ParseFailure();
        position++;
        node = frame.node;
        stack.pop();
      }
    }
  };
  const diagnostics: NativeSelectionDiagnostic[] = [];
  try {
    const root = parse();
    const lookup = (name: string): Node | undefined => root.children.find(node => {
      if (node.key === null) return false;
      let index = 0;
      while (true) {
        const left = node.key[index] ?? 0;
        const right = index < name.length ? name.charCodeAt(index) : 0;
        if ((dependencies.foldByte(left > 0x7f ? left - 0x100 : left) | 0)
          !== (dependencies.foldByte(right) | 0)) {
          // The native mismatch branch repeats folding with zero-extended bytes.
          return ((dependencies.foldByte(left) - dependencies.foldByte(right)) | 0) === 0;
        }
        if (left === 0) return true;
        index++;
      }
    });
    const extract = (name: NativeSelectionDiagnostic['list']): Uint8Array[] => {
      const output: Uint8Array[] = [];
      lookup(name)?.children.forEach((node, index) => {
        if (node.string === null) diagnostics.push({ list: name, index, kind: 'non-string-child' });
        else {
          const zero = node.string.indexOf(0);
          output.push(node.string.slice(0, zero < 0 ? node.string.length : zero));
        }
      });
      return output;
    };
    const disabledDlcs = extract('disabled_dlcs');
    const enabledMods = extract('enabled_mods');
    return { kind: 'returned', parsed: true, disabledDlcs, enabledMods, diagnostics };
  }
  catch (error) {
    if (error instanceof ReadBoundary) return { kind: 'runtime-required', reason: 'read-beyond-c-string', offset: error.offset };
    if (!(error instanceof ParseFailure)) throw error;
    return { kind: 'returned', parsed: false, disabledDlcs: [], enabledMods: [], diagnostics: [] };
  }
}
