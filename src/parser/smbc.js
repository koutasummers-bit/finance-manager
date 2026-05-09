import Papa from 'papaparse';
import { isDateString, normalizeText, parseAmount, toIsoDate } from '../core/normalize.js';

// SMBC 個人口座 CSV の典型的な列構成 (ヘッダなし):
//   年月日, お引出し金額, お預入れ金額, お取り扱い内容, 残高, メモ
// ヘッダがある場合の列名にも対応するため、ヘッダ検出を行う。

const SMBC_HEADER_HINTS = ['年月日', 'お引出', 'お預入', 'お取り扱い'];

function isHeaderRow(row) {
  if (!row || row.length === 0) return false;
  const joined = row.map(normalizeText).join('|');
  return SMBC_HEADER_HINTS.some((h) => joined.includes(h));
}

function rowsFromCsv(text) {
  const result = Papa.parse(text, {
    header: false,
    skipEmptyLines: 'greedy',
  });
  return result.data.filter((r) => Array.isArray(r) && r.some((c) => normalizeText(c) !== ''));
}

export function parseSmbc(text) {
  const rows = rowsFromCsv(text);
  if (rows.length === 0) {
    return { transactions: [], errors: ['SMBC: CSV が空です'] };
  }

  let start = 0;
  if (isHeaderRow(rows[0])) start = 1;

  const transactions = [];
  const errors = [];

  for (let i = start; i < rows.length; i++) {
    const row = rows[i];
    if (row.length < 4) {
      errors.push(`SMBC: ${i + 1}行目 列数不足 (${row.length}列)`);
      continue;
    }

    const dateStr = normalizeText(row[0]);
    if (!isDateString(dateStr)) {
      errors.push(`SMBC: ${i + 1}行目 日付として解釈できません: ${dateStr}`);
      continue;
    }
    const date = toIsoDate(dateStr);

    const withdrawal = parseAmount(row[1]) ?? 0;
    const deposit = parseAmount(row[2]) ?? 0;
    const description = normalizeText(row[3]);
    const balance = row.length > 4 ? parseAmount(row[4]) : null;
    const memo = row.length > 5 ? normalizeText(row[5]) : '';

    const amount = deposit > 0 ? deposit : -withdrawal;
    const isIncome = deposit > 0;

    transactions.push({
      source: 'smbc',
      date,
      description,
      memo,
      amount,
      withdrawal,
      deposit,
      balance,
      isIncome,
      raw: { row },
    });
  }

  return { transactions, errors };
}
