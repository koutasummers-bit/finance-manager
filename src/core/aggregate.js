import { monthKey } from './normalize.js';

// 月次・カテゴリ別の集計を行う。
// 引数:
//   bank: SMBC Transaction[] (categorize 済み、isExcluded 反映済み)
//   card: VPass Transaction[] (categorize 済み)
// 戻り値:
//   {
//     months: ['2026-04', '2026-05', ...],
//     categories: ['食費', '交通費', ...],
//     incomeCategories: ['収入'],
//     summary: { [month]: { [category]: number, _income: number, _expense: number, _balance: number } },
//     totals: { byCategory: {category: number}, byMonth: {month: number}, grandIncome: number, grandExpense: number }
//   }

const INCOME_CATEGORIES = new Set(['収入']);

export function aggregate(bank, card) {
  const all = [
    ...bank.filter((t) => !t.isExcluded),
    ...card,
  ];

  const summary = {};
  const monthsSet = new Set();
  const categoriesSet = new Set();
  const incomeSet = new Set();
  const totalsByCategory = {};
  const totalsByMonth = {};
  let grandIncome = 0;
  let grandExpense = 0;

  for (const t of all) {
    const month = monthKey(t.date);
    if (!month) continue;
    const category = t.category ?? '未分類';
    const isIncome = t.isIncome === true || INCOME_CATEGORIES.has(category);
    monthsSet.add(month);
    categoriesSet.add(category);
    if (isIncome) incomeSet.add(category);

    summary[month] ??= { _income: 0, _expense: 0, _balance: 0 };
    summary[month][category] ??= 0;

    const amount = t.amount ?? 0;
    if (isIncome) {
      const value = Math.abs(amount);
      summary[month][category] += value;
      summary[month]._income += value;
      grandIncome += value;
    } else {
      const value = Math.abs(amount);
      summary[month][category] += value;
      summary[month]._expense += value;
      grandExpense += value;
    }

    totalsByCategory[category] = (totalsByCategory[category] ?? 0) + Math.abs(amount);
    totalsByMonth[month] = (totalsByMonth[month] ?? 0) + (isIncome ? Math.abs(amount) : -Math.abs(amount));
  }

  for (const m of monthsSet) {
    summary[m]._balance = (summary[m]._income ?? 0) - (summary[m]._expense ?? 0);
  }

  const months = [...monthsSet].sort();
  const categories = [...categoriesSet]
    .filter((c) => !incomeSet.has(c))
    .sort();
  const incomeCategories = [...incomeSet].sort();

  return {
    months,
    categories,
    incomeCategories,
    summary,
    totals: { byCategory: totalsByCategory, byMonth: totalsByMonth, grandIncome, grandExpense },
  };
}
