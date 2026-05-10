import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseVpass } from '../src/parser/vpass.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(here, 'fixtures/vpass-sample.csv');

describe('parseVpass', () => {
  it('parses sample VPass CSV with cardholder + subtotal rows', () => {
    const text = readFileSync(fixture, 'utf-8');
    const { transactions, errors } = parseVpass(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(14); // 名義人行・小計行はスキップ

    const first = transactions[0];
    expect(first.date).toBe('2026-04-03');
    expect(first.description).toBe('ローソン渋谷店');
    expect(first.usageAmount).toBe(580);
    expect(first.monthlyPayment).toBe(580);
    expect(first.amount).toBe(-580);
    expect(first.paymentKind).toBe('1回払い');
  });

  it('uses monthly payment for split payments', () => {
    const text = readFileSync(fixture, 'utf-8');
    const { transactions } = parseVpass(text);
    const split = transactions.find((t) => t.description === 'Amazon.co.jp' && t.date === '2026-04-08');
    expect(split.usageAmount).toBe(9000);
    expect(split.monthlyPayment).toBe(3000);
    expect(split.amount).toBe(-3000);
    expect(split.paymentKind).toBe('分割払い');
  });

  it('falls back to usage amount when monthly column is missing', () => {
    const text = '2026/04/01,テスト店,1500,1,1\n';
    const { transactions } = parseVpass(text);
    expect(transactions.length).toBe(1);
    expect(transactions[0].monthlyPayment).toBe(1500);
    expect(transactions[0].amount).toBe(-1500);
  });

  it('skips cardholder ID rows and subtotals', () => {
    const text =
      'テストユーザー,1234-56**-****-****,VISA,,,\n' +
      '2026/04/01,テスト店,1000,1,1,1000\n' +
      ',,,,,1000\n';
    const { transactions, errors } = parseVpass(text);
    expect(errors).toEqual([]);
    expect(transactions.length).toBe(1);
  });

  it('handles full-width digits in payment kind column', () => {
    // VPass の実データは支払区分が全角数字の "１" になることがある
    const text = '2026/04/01,テスト店,1000,１,１,1000\n';
    const { transactions } = parseVpass(text);
    expect(transactions[0].paymentKind).toBe('1回払い');
  });
});
