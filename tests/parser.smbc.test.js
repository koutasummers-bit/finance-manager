import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSmbc } from '../src/parser/smbc.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/smbc-sample.csv');

describe('parseSmbc', () => {
  it('parses sample SMBC CSV with header and 7 columns (incl. ラベル)', () => {
    const text = readFileSync(fixture, 'utf-8');
    const { transactions, errors } = parseSmbc(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(11);

    const first = transactions[0];
    expect(first.date).toBe('2026-04-01');
    expect(first.deposit).toBe(250000);
    expect(first.withdrawal).toBe(0);
    expect(first.amount).toBe(250000);
    expect(first.isIncome).toBe(true);
    expect(first.description).toContain('給与振込');

    const cardRow = transactions.find((t) => t.description.includes('ﾐﾂｲｽﾐﾄﾓ') || t.description.includes('ミツイスミトモ'));
    expect(cardRow).toBeDefined();
    expect(cardRow.withdrawal).toBe(45230);
    expect(cardRow.amount).toBe(-45230);
  });

  it('handles 6-column rows (legacy format without ラベル)', () => {
    const text =
      '年月日,お引出し金額,お預入れ金額,お取り扱い内容,残高,メモ\n' +
      '2026/04/01,,250000,給与,1000000,\n' +
      '2026/04/02,500,,コンビニ,999500,\n';
    const { transactions, errors } = parseSmbc(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(2);
    expect(transactions[0].deposit).toBe(250000);
    expect(transactions[1].withdrawal).toBe(500);
  });

  it('reports error for non-date first column', () => {
    const text = '2026/04/01,500,,コンビニ,1000,\nbroken,500,,コンビニ,1000,\n';
    const { transactions, errors } = parseSmbc(text);
    expect(transactions.length).toBe(1);
    expect(errors.length).toBe(1);
    expect(errors[0]).toContain('日付として解釈できません');
  });
});
