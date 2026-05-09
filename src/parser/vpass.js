import Papa from 'papaparse';
import { isDateString, normalizeText, parseAmount, toIsoDate } from '../core/normalize.js';

// VPass CSV の典型的な列構成 (ヘッダなしのことが多い):
//   ご利用日, ご利用店名・商品名, ご利用者, 支払区分, 今回回数, ご利用金額, 今月支払金額(任意)
// 「今月の支払金額」をユーザー要望により集計に採用する。
// 列が無い場合は「ご利用金額」を支払額として扱う。

const VPASS_HEADER_HINTS = ['ご利用日', '利用日', 'ご利用店名', '支払区分', 'ご利用金額', '支払金額'];

function isHeaderRow(row) {
  if (!row || row.length === 0) return false;
  const joined = row.map(normalizeText).join('|');
  return VPASS_HEADER_HINTS.some((h) => joined.includes(h));
}

function rowsFromCsv(text) {
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  return result.data.filter((r) => Array.isArray(r) && r.some((c) => normalizeText(c) !== ''));
}

// 列インデックスを推定する。ヘッダがあればヘッダ名から、なければ既知のレイアウトを優先順位で探索する。
function detectColumns(rows, headerRow) {
  if (headerRow) {
    const idx = headerRow.map((c) => normalizeText(c));
    const find = (...keys) => {
      for (const k of keys) {
        const i = idx.findIndex((h) => h.includes(k));
        if (i >= 0) return i;
      }
      return -1;
    };
    return {
      date: find('ご利用日', '利用日'),
      payee: find('ご利用店名', '利用店名', '商品名'),
      kind: find('支払区分'),
      installments: find('今回回数', '回数'),
      usage: find('ご利用金額', '利用金額'),
      monthly: find('今月支払金額', '支払金額'),
    };
  }

  // ヘッダなしの典型レイアウト: [日付, 店名, 利用者, 支払区分, 今回回数, 利用金額, 今月支払金額]
  // 最低限、日付列(0)と金額列の位置を行データから推定する。
  const sample = rows.find((r) => r.length >= 5);
  if (!sample) return { date: 0, payee: 1, kind: 3, installments: 4, usage: 5, monthly: 6 };

  return {
    date: 0,
    payee: 1,
    kind: 3,
    installments: 4,
    usage: 5,
    monthly: sample.length >= 7 ? 6 : 5,
  };
}

export function parseVpass(text) {
  const rows = rowsFromCsv(text);
  if (rows.length === 0) {
    return { transactions: [], errors: ['VPass: CSV が空です'] };
  }

  let start = 0;
  let headerRow = null;
  if (isHeaderRow(rows[0])) {
    headerRow = rows[0];
    start = 1;
  }

  const cols = detectColumns(rows.slice(start), headerRow);
  const transactions = [];
  const errors = [];

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = normalizeText(row[cols.date] ?? '');
    if (!isDateString(dateStr)) {
      errors.push(`VPass: ${i + 1}行目 日付として解釈できません: ${dateStr}`);
      continue;
    }
    const date = toIsoDate(dateStr);

    const description = normalizeText(row[cols.payee] ?? '');
    const paymentKind = cols.kind >= 0 ? normalizeText(row[cols.kind] ?? '') : '';
    const installments = cols.installments >= 0 ? normalizeText(row[cols.installments] ?? '') : '';
    const usage = cols.usage >= 0 ? parseAmount(row[cols.usage]) : null;
    const monthly = cols.monthly >= 0 ? parseAmount(row[cols.monthly]) : null;

    // 支出として採用する金額: 今月支払金額があればそれ、なければ利用金額。
    const monthlyPayment = monthly ?? usage ?? 0;

    transactions.push({
      source: 'vpass',
      date,
      description,
      paymentKind,
      installments,
      usageAmount: usage ?? 0,
      monthlyPayment,
      amount: -Math.abs(monthlyPayment),
      isIncome: false,
      raw: { row },
    });
  }

  return { transactions, errors };
}
