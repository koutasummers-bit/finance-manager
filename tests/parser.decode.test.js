import { describe, expect, it } from 'vitest';
import { decodeBytes } from '../src/parser/decode.js';

function bytes(...arr) {
  return new Uint8Array(arr);
}

describe('decodeBytes', () => {
  it('strips UTF-8 BOM and decodes as UTF-8', () => {
    // BOM + "あ"
    const buf = bytes(0xef, 0xbb, 0xbf, 0xe3, 0x81, 0x82);
    expect(decodeBytes(buf)).toBe('あ');
  });

  it('decodes plain UTF-8 (no BOM)', () => {
    const buf = new TextEncoder().encode('テスト,1,2');
    expect(decodeBytes(buf)).toBe('テスト,1,2');
  });

  it('decodes Shift_JIS bytes', () => {
    // "あいう" in Shift_JIS: 82 A0 82 A2 82 A4
    const buf = bytes(0x82, 0xa0, 0x82, 0xa2, 0x82, 0xa4);
    expect(decodeBytes(buf)).toBe('あいう');
  });

  it('decodes ASCII without ambiguity', () => {
    const buf = new TextEncoder().encode('hello');
    expect(decodeBytes(buf)).toBe('hello');
  });
});
