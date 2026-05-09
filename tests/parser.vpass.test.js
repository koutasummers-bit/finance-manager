import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVpass } from '../src/parser/vpass.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/vpass-sample.csv');

describe('parseVpass', () => {
  it('parses sample VPass CSV (no header)', () => {
    const text = readFileSync(fixture, 'utf-8');
    const { transactions, errors } = parseVpass(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(14);

    const first = transactions[0];
    expect(first.date).toBe('2026-04-03');
    expect(first.description).toBe('ローソン渋谷店');
    expect(first.usageAmount).toBe(580);
    expect(first.monthlyPayment).toBe(580);
    expect(first.amount).toBe(-580);
  });

  it('uses monthly payment for split payments', () => {
    const text = readFileSync(fixture, 'utf-8');
    const { transactions } = parseVpass(text);
    const split = transactions.find((t) => t.description === 'Amazon.co.jp' && t.date === '2026-04-08');
    expect(split.usageAmount).toBe(9000);
    expect(split.monthlyPayment).toBe(3000);
    expect(split.amount).toBe(-3000);
    expect(split.paymentKind).toContain('分割');
  });

  it('falls back to usage amount when monthly column is missing', () => {
    const text = '2026/04/01,テスト店,本人,1回払い,,1500\n';
    const { transactions } = parseVpass(text);
    expect(transactions.length).toBe(1);
    expect(transactions[0].monthlyPayment).toBe(1500);
    expect(transactions[0].amount).toBe(-1500);
  });

  it('parses header row when present', () => {
    const text =
      'ご利用日,ご利用店名,ご利用者,支払区分,今回回数,ご利用金額,今月支払金額\n' +
      '2026/04/01,テスト店,本人,1回払い,,1000,1000\n';
    const { transactions, errors } = parseVpass(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(1);
    expect(transactions[0].monthlyPayment).toBe(1000);
  });
});
