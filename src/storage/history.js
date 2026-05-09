// 月次の集計結果のみを localStorage に保存する。生明細は保存しない (プライバシー優先)。
// 形式: { "2026-04": { categorySum: {...}, income: number, expense: number, balance: number, savedAt: ISO } }

const KEY = 'finance-manager:history:v1';

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function save(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // QuotaExceeded など。サイレントに無視 (集計済み数値のみなので量は少ないはず)。
  }
}

export function getHistory() {
  return load();
}

export function saveAggregation(agg) {
  const data = load();
  for (const month of agg.months) {
    const m = agg.summary[month] ?? {};
    const categorySum = {};
    for (const [k, v] of Object.entries(m)) {
      if (!k.startsWith('_')) categorySum[k] = v;
    }
    data[month] = {
      categorySum,
      income: m._income ?? 0,
      expense: m._expense ?? 0,
      balance: m._balance ?? 0,
      savedAt: new Date().toISOString(),
    };
  }
  save(data);
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

export function historyMonths(history) {
  return Object.keys(history).sort();
}
