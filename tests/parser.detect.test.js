import { describe, expect, it } from 'vitest';
import { detectFormat } from '../src/parser/detect.js';

describe('detectFormat', () => {
  it('detects SMBC by header keywords', () => {
    const text = '年月日,お引出し,お預入れ,お取り扱い内容,残高,メモ,ラベル\n2026/04/01,,1000,給与,1000,,';
    expect(detectFormat(text)).toBe('smbc');
  });

  it('detects VPass by 支払区分 column header', () => {
    const text = 'ご利用日,ご利用店名,ご利用金額,支払区分,今回回数,月別総額\n2026/04/01,店,1000,1,1,1000';
    expect(detectFormat(text)).toBe('vpass');
  });

  it('detects VPass from masked card number', () => {
    const text = 'テストたろう,1110-00**-****-****,Oliveゴールド,,,\n2026/04/01,店,1000,1,1,1000';
    expect(detectFormat(text)).toBe('vpass');
  });

  it('detects VPass from data row with numeric payment-kind column', () => {
    const text = '2026/04/01,ローソン,580,1,1,580\n';
    expect(detectFormat(text)).toBe('vpass');
  });

  it('detects SMBC from data rows when no header', () => {
    const text = '2026/04/01,500,,コンビニ,1000,\n';
    expect(detectFormat(text)).toBe('smbc');
  });

  it('uses filename hint when ambiguous', () => {
    const text = '\n';
    expect(detectFormat(text, 'vpass-202604.csv')).toBe('vpass');
    expect(detectFormat(text, 'mitui-202604.csv')).toBe('smbc');
    expect(detectFormat(text, 'meisai-202604.csv')).toBe('smbc');
  });
});
