import { monthKey } from './normalize.js';

// 月次・カテゴリ別の集計。
// 戻り値:
//   {
//     months: ['2026-04', ...],
//     incomeCategories: [...],     // カテゴリの収入合計 > 支出合計のもの
//     categories: [...],           // カテゴリの支出合計 >= 収入合計のもの (出力上の「支出カテゴリ」)
//     summary: { [month]: { [category]: number, _income, _expense, _balance } },
//     totals: { byCategory: {category: number}, byMonth: {month: number}, grandIncome, grandExpense }
//   }
// summary[month][category] は「ネット流量」:
//   収入カテゴリ → 収入−支出 (正の値ほど純流入が大きい)
//   支出カテゴリ → 支出−収入 (正の値ほど純流出が大きい)
// これにより、同一カテゴリに収入と支出が混在 (例: カード引落への返金) しても、
// 月次サマリには意味のある単一値が表示される。

export function aggregate(bank, card) {
  const all = [
    ...bank.filter((t) => !t.isExcluded),
    ...card,
  ];

  const monthsSet = new Set();
  const categoriesSet = new Set();
  // category -> { income, expense, byMonth: { [month]: { income, expense } } }
  const cflow = new Map();
  // month -> { income, expense }
  const mflow = new Map();

  for (const t of all) {
    const month = monthKey(t.date);
    if (!month) continue;
    const category = t.category ?? '未分類';
    const amount = t.amount ?? 0;
    if (amount === 0) continue;
    const value = Math.abs(amount);
    const isIncome = amount > 0;

    monthsSet.add(month);
    categoriesSet.add(category);

    if (!cflow.has(category)) cflow.set(category, { income: 0, expense: 0, byMonth: {} });
    const cf = cflow.get(category);
    cf.byMonth[month] ??= { income: 0, expense: 0 };
    if (!mflow.has(month)) mflow.set(month, { income: 0, expense: 0 });
    const mf = mflow.get(month);

    if (isIncome) {
      cf.income += value;
      cf.byMonth[month].income += value;
      mf.income += value;
    } else {
      cf.expense += value;
      cf.byMonth[month].expense += value;
      mf.expense += value;
    }
  }

  const incomeCats = [];
  const expenseCats = [];
  for (const c of categoriesSet) {
    const cf = cflow.get(c);
    if (cf.income > cf.expense) incomeCats.push(c);
    else expenseCats.push(c);
  }
  incomeCats.sort();
  expenseCats.sort();

  const summary = {};
  const totalsByCategory = {};
  const totalsByMonth = {};
  let grandIncome = 0;
  let grandExpense = 0;

  for (const m of monthsSet) {
    const mf = mflow.get(m) ?? { income: 0, expense: 0 };
    summary[m] = { _income: mf.income, _expense: mf.expense, _balance: mf.income - mf.expense };
    totalsByMonth[m] = mf.income - mf.expense;
    grandIncome += mf.income;
    grandExpense += mf.expense;

    for (const c of categoriesSet) {
      const cmf = cflow.get(c)?.byMonth?.[m] ?? { income: 0, expense: 0 };
      const isIncomeCat = incomeCats.includes(c);
      summary[m][c] = isIncomeCat ? (cmf.income - cmf.expense) : (cmf.expense - cmf.income);
    }
  }

  for (const c of categoriesSet) {
    const cf = cflow.get(c);
    const isIncomeCat = incomeCats.includes(c);
    totalsByCategory[c] = isIncomeCat ? (cf.income - cf.expense) : (cf.expense - cf.income);
  }

  const months = [...monthsSet].sort();

  return {
    months,
    categories: expenseCats,
    incomeCategories: incomeCats,
    summary,
    totals: { byCategory: totalsByCategory, byMonth: totalsByMonth, grandIncome, grandExpense },
  };
}
