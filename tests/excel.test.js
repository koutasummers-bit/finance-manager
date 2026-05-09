import { describe, expect, it } from 'vitest';
import { buildWorkbook, suggestFileName } from '../src/output/excel.js';
import { aggregate } from '../src/core/aggregate.js';

describe('buildWorkbook', () => {
  it('creates 4 sheets with expected names', async () => {
    const bank = [
      { date: '2026-04-01', description: '給与', amount: 250000, deposit: 250000, withdrawal: 0, isIncome: true, category: '収入' },
      { date: '2026-04-03', description: 'ローソン', amount: -580, deposit: 0, withdrawal: 580, category: '食費' },
    ];
    const card = [
      { date: '2026-04-05', description: 'Amazon', usageAmount: 3000, monthlyPayment: 3000, paymentKind: '1回払い', amount: -3000, category: 'ショッピング' },
    ];
    const agg = aggregate(bank, card);
    const wb = await buildWorkbook({ bank, card, agg });
    const names = wb.worksheets.map((s) => s.name);
    expect(names).toEqual(['月次サマリ', '銀行明細', 'カード明細', 'カテゴリ別集計']);

    const summary = wb.getWorksheet('月次サマリ');
    expect(summary.rowCount).toBeGreaterThan(1);
  });
});

describe('suggestFileName', () => {
  it('handles single month', () => {
    expect(suggestFileName(['2026-04'])).toBe('家計簿_202604.xlsx');
  });
  it('handles range', () => {
    expect(suggestFileName(['2026-04', '2026-05'])).toBe('家計簿_202604_202605.xlsx');
  });
  it('handles empty', () => {
    expect(suggestFileName([])).toBe('家計簿.xlsx');
  });
});
