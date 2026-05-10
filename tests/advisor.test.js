import { describe, expect, it } from 'vitest';
import { generateAdvice } from '../src/core/advisor.js';

function makeAgg({ months, summary, totals, categories, incomeCategories = [] }) {
  return { months, summary, totals, categories, incomeCategories };
}

describe('generateAdvice', () => {
  it('returns empty for empty agg', () => {
    const agg = makeAgg({ months: [], summary: {}, totals: { grandIncome: 0, grandExpense: 0 }, categories: [] });
    expect(generateAdvice(agg)).toEqual([]);
  });

  it('flags monthly deficit and overall deficit', () => {
    const agg = makeAgg({
      months: ['2026-01', '2026-02'],
      categories: ['食費'],
      summary: {
        '2026-01': { _income: 100000, _expense: 80000, _balance: 20000, 食費: 80000 },
        '2026-02': { _income: 50000, _expense: 90000, _balance: -40000, 食費: 90000 },
      },
      totals: { grandIncome: 150000, grandExpense: 170000 },
    });
    const advice = generateAdvice(agg);
    const titles = advice.map((a) => a.title);
    expect(titles.some((t) => t.includes('赤字'))).toBe(true);
    expect(advice[0].severity).toBe('alert');
  });

  it('flags large category increase month over month', () => {
    const agg = makeAgg({
      months: ['2026-01', '2026-02'],
      categories: ['食費'],
      summary: {
        '2026-01': { _income: 200000, _expense: 30000, _balance: 170000, 食費: 30000 },
        '2026-02': { _income: 200000, _expense: 80000, _balance: 120000, 食費: 80000 },
      },
      totals: { grandIncome: 400000, grandExpense: 110000 },
    });
    const advice = generateAdvice(agg);
    const incTitle = advice.find((a) => a.title.includes('食費 が前月比 +'));
    expect(incTitle).toBeDefined();
    expect(incTitle.severity).toBe('alert'); // 50,000 増は alert
  });

  it('flags 3-month consecutive increase', () => {
    const agg = makeAgg({
      months: ['2026-01', '2026-02', '2026-03'],
      categories: ['通信費'],
      summary: {
        '2026-01': { _income: 200000, _expense: 5000, _balance: 195000, 通信費: 5000 },
        '2026-02': { _income: 200000, _expense: 7000, _balance: 193000, 通信費: 7000 },
        '2026-03': { _income: 200000, _expense: 10000, _balance: 190000, 通信費: 10000 },
      },
      totals: { grandIncome: 600000, grandExpense: 22000 },
    });
    const advice = generateAdvice(agg);
    expect(advice.some((a) => a.title.includes('3ヶ月連続'))).toBe(true);
  });

  it('flags new category appearance', () => {
    const agg = makeAgg({
      months: ['2026-01', '2026-02'],
      categories: ['食費', 'サブスク'],
      summary: {
        '2026-01': { _income: 200000, _expense: 30000, _balance: 170000, 食費: 30000, サブスク: 0 },
        '2026-02': { _income: 200000, _expense: 31490, _balance: 168510, 食費: 30000, サブスク: 1490 },
      },
      totals: { grandIncome: 400000, grandExpense: 61490 },
    });
    const advice = generateAdvice(agg);
    expect(advice.some((a) => a.title.includes('新しいカテゴリ「サブスク」'))).toBe(true);
  });

  it('praises good savings rate', () => {
    const agg = makeAgg({
      months: ['2026-01'],
      categories: ['食費'],
      summary: { '2026-01': { _income: 300000, _expense: 200000, _balance: 100000, 食費: 200000 } },
      totals: { grandIncome: 300000, grandExpense: 200000 },
    });
    const advice = generateAdvice(agg);
    expect(advice.some((a) => a.severity === 'info' && a.title.includes('貯蓄率'))).toBe(true);
  });

  it('warns when current month spending is far above average', () => {
    const agg = makeAgg({
      months: ['2026-01', '2026-02', '2026-03'],
      categories: ['食費'],
      summary: {
        '2026-01': { _income: 300000, _expense: 30000, _balance: 270000, 食費: 30000 },
        '2026-02': { _income: 300000, _expense: 35000, _balance: 265000, 食費: 35000 },
        '2026-03': { _income: 300000, _expense: 90000, _balance: 210000, 食費: 90000 },
      },
      totals: { grandIncome: 900000, grandExpense: 155000 },
    });
    const advice = generateAdvice(agg);
    expect(advice.some((a) => a.title.includes('過去平均より') && a.title.includes('多い'))).toBe(true);
  });
});
