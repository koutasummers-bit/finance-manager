import { describe, expect, it } from 'vitest';
import { aggregate } from '../src/core/aggregate.js';

describe('aggregate', () => {
  it('sums by month and category, separating income and expense', () => {
    const bank = [
      { date: '2026-04-01', amount: 250000, isIncome: true, category: '収入' },
      { date: '2026-04-03', amount: -580, category: '食費' },
      { date: '2026-04-15', amount: -12000, category: '光熱費' },
      { date: '2026-04-26', amount: -45230, category: 'カード引落', isExcluded: true },
    ];
    const card = [
      { date: '2026-04-03', amount: -580, category: '食費' },
      { date: '2026-04-15', amount: -1490, category: 'サブスク' },
    ];
    const agg = aggregate(bank, card);
    expect(agg.months).toEqual(['2026-04']);
    expect(agg.summary['2026-04']._income).toBe(250000);
    // 食費 580(銀行) + 580(カード) = 1160、光熱費 12000、サブスク 1490
    expect(agg.summary['2026-04']._expense).toBe(580 + 580 + 12000 + 1490);
    expect(agg.summary['2026-04']._balance).toBe(250000 - (580 + 580 + 12000 + 1490));
    expect(agg.incomeCategories).toEqual(['収入']);
    expect(agg.categories).toContain('食費');
    expect(agg.categories).toContain('光熱費');
    expect(agg.categories).toContain('サブスク');
    // 除外行は集計に含まれない
    expect(agg.categories).not.toContain('カード引落');
  });

  it('produces multi-month results', () => {
    const bank = [
      { date: '2026-04-01', amount: -1000, category: '食費' },
      { date: '2026-05-01', amount: -2000, category: '食費' },
    ];
    const agg = aggregate(bank, []);
    expect(agg.months).toEqual(['2026-04', '2026-05']);
    expect(agg.summary['2026-04']._expense).toBe(1000);
    expect(agg.summary['2026-05']._expense).toBe(2000);
  });
});
