import { normalizeText, monthKey } from './normalize.js';

// 銀行明細から VPass 引落候補を検出し、同月のカード明細合計と突合する。
// 差額が `tolerance` 以内なら「自動マッチ確定」フラグを立てる。
// UI 側でユーザーが手動 ON/OFF 可能なため、ここでは候補とマッチ情報を返すのみで
// 集計時に除外するかは別レイヤで決める。

const DEFAULT_KEYWORDS = [
  'VPASS', 'ヴィパス',
  '三井住友カード', 'SMBCカード',
  // 半角カナで明細に来た場合は NFKC で全角化されるため、全角形を登録
  'ミツイスミトモカ', 'ミツイスミトモ',
  'カード引落', 'カードヒキオトシ',
  'VISA',
];

function matchesKeyword(description, keywords) {
  const target = normalizeText(description).toUpperCase();
  return keywords.some((k) => target.includes(normalizeText(k).toUpperCase()));
}

export function findCardWithdrawals(bankTransactions, keywords = DEFAULT_KEYWORDS) {
  return bankTransactions
    .map((t, index) => ({ index, t }))
    .filter(({ t }) => t.amount < 0 && matchesKeyword(t.description, keywords))
    .map(({ index, t }) => ({
      bankIndex: index,
      date: t.date,
      month: monthKey(t.date),
      description: t.description,
      amount: Math.abs(t.amount),
    }));
}

// 月ごとに、銀行側のカード引落候補と VPass 側の今月支払金額合計を突合。
export function reconcile(candidates, vpassTransactions, tolerance = 100) {
  const vpassByMonth = new Map();
  for (const t of vpassTransactions) {
    const m = monthKey(t.date);
    vpassByMonth.set(m, (vpassByMonth.get(m) ?? 0) + Math.abs(t.amount));
  }

  // 引落は通常、利用月の翌月に発生するため、当月マッチと翌月マッチの両方を試す。
  return candidates.map((c) => {
    const sameMonth = vpassByMonth.get(c.month) ?? 0;
    const prevMonth = vpassByMonth.get(prevMonthKey(c.month)) ?? 0;
    const diffSame = Math.abs(c.amount - sameMonth);
    const diffPrev = Math.abs(c.amount - prevMonth);
    const useSame = diffSame <= diffPrev;
    const matchedMonth = useSame ? c.month : prevMonthKey(c.month);
    const matchedTotal = useSame ? sameMonth : prevMonth;
    const diff = useSame ? diffSame : diffPrev;
    return {
      ...c,
      matchedMonth,
      matchedTotal,
      diff,
      autoExclude: matchedTotal > 0 && diff <= tolerance,
    };
  });
}

function prevMonthKey(m) {
  if (!/^\d{4}-\d{2}$/.test(m)) return m;
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mm - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// 集計時に除外フラグを反映する。excludedBankIndices は Set<number>。
export function applyExclusions(bankTransactions, excludedBankIndices) {
  return bankTransactions.map((t, i) => ({
    ...t,
    isCardWithdrawal: excludedBankIndices.has(i) ? true : t.isCardWithdrawal,
    isExcluded: excludedBankIndices.has(i),
  }));
}
