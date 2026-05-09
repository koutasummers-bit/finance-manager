import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/parser/detect.js';

describe('detectFormat', () => {
  it('detects SMBC by header keywords', () => {
    const text = '年月日,お引出し金額,お預入れ金額,お取り扱い内容,残高,メモ\n2026/04/01,,1000,給与,1000,';
    expect(detectFormat(text)).toBe('smbc');
  });

  it('detects VPass by 支払区分 column', () => {
    const text = 'ご利用日,ご利用店名,ご利用者,支払区分,今回回数,ご利用金額\n2026/04/01,店,本人,1回払い,,1000';
    expect(detectFormat(text)).toBe('vpass');
  });

  it('detects VPass from data rows when no header', () => {
    const text = '2026/04/01,ローソン,本人,1回払い,,580,580\n';
    expect(detectFormat(text)).toBe('vpass');
  });

  it('detects SMBC from data rows when no header', () => {
    const text = '2026/04/01,500,,コンビニ,1000,\n';
    expect(detectFormat(text)).toBe('smbc');
  });

  it('uses filename hint when ambiguous', () => {
    const text = '2026/04/01,1,2,3,4,5\n';
    expect(detectFormat(text, 'vpass-202604.csv')).toBe('vpass');
  });
});
