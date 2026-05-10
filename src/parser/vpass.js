import Papa from 'papaparse';
import { isDateString, normalizeText, parseAmount, toIsoDate } from '../core/normalize.js';

// VPass CSV (三井住友カード) のフォーマット (6 列、ヘッダ行なし):
//   ご利用日, ご利用店名・商品名, ご利用金額, 支払区分(数値: 1=1回払い等), 今回回数, 月別総額(今月支払金額)
//
// 先頭にカード名義人＋マスクされたカード番号の行、末尾(あるいは間)に小計/総合計行が
// 入ることがある。「日付で始まる行」だけを取引として扱い、それ以外は黙ってスキップする。

const KIND_LABELS = {
  '1': '1回払い',
  '2': '2回払い',
  '3': '分割払い',
  '4': 'リボ払い',
  '5': 'ボーナス',
  '6': 'ボーナス分割',
  '7': '据置',
};

function paymentKindLabel(code) {
  if (code == null) return '';
  const c = normalizeText(String(code));
  if (KIND_LABELS[c]) return KIND_LABELS[c];
  if (/分割/.test(c)) return '分割払い';
  if (/リボ/.test(c)) return 'リボ払い';
  if (/ボーナス/.test(c)) return 'ボーナス';
  if (/(一括|1回|一回)/.test(c)) return '1回払い';
  return c;
}

function rowsFromCsv(text) {
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  return result.data.filter((r) => Array.isArray(r) && r.some((c) => normalizeText(c) !== ''));
}

export function parseVpass(text) {
  const rows = rowsFromCsv(text);
  if (rows.length === 0) {
    return { transactions: [], errors: ['VPass: CSV が空です'] };
  }

  const transactions = [];
  const errors = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const dateStr = normalizeText(row[0] ?? '');
    if (!isDateString(dateStr)) {
      // 日付ではない行 (ヘッダ・名義人＋カード番号・小計・総合計など) はスキップ。
      continue;
    }
    if (row.length < 3) {
      errors.push(`VPass: ${i + 1}行目 列数不足 (${row.length}列)`);
      continue;
    }
    const date = toIsoDate(dateStr);
    const description = normalizeText(row[1] ?? '');
    const usage = parseAmount(row[2]);
    const kindRaw = normalizeText(row[3] ?? '');
    const installments = normalizeText(row[4] ?? '');
    const monthly = row.length > 5 ? parseAmount(row[5]) : null;
    const monthlyPayment = monthly ?? usage ?? 0;

    transactions.push({
      source: 'vpass',
      date,
      description,
      paymentKind: paymentKindLabel(kindRaw),
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
