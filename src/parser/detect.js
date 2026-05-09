import Papa from 'papaparse';
import { normalizeText } from '../core/normalize.js';

// CSV のフォーマットを SMBC / VPass / unknown のいずれかに判定する。
// 1) ファイル名のヒント、2) ヘッダ文字列、3) 列数や支払区分の値などから判定。

const SMBC_HINTS = ['年月日', 'お引出', 'お預入', 'お取り扱い'];
const VPASS_HINTS = ['ご利用店名', '支払区分', '1回払い', '一回払い', '分割払い', 'リボ払い'];

export function detectFormat(text, fileName = '') {
  const name = fileName.toLowerCase();
  if (/vpass|smcc|smbccard|smbc-card/.test(name)) return 'vpass';
  if (/meisai|kouza|smbc(?!card)/.test(name)) return 'smbc';

  const result = Papa.parse(text, { header: false, skipEmptyLines: 'greedy' });
  const rows = (result.data || []).slice(0, 10);
  const flat = rows.flat().map(normalizeText).join('|');

  if (SMBC_HINTS.some((h) => flat.includes(h))) return 'smbc';
  if (VPASS_HINTS.some((h) => flat.includes(h))) return 'vpass';

  // ヘッダなしでも値からの判定
  const sampleRow = rows.find((r) => r.length >= 4);
  if (sampleRow) {
    if (sampleRow.length === 6 && /^\d{4}/.test(normalizeText(sampleRow[0]))) {
      // 6 列固定で日付始まりは SMBC を疑う
      return 'smbc';
    }
    if (sampleRow.length >= 5) {
      const kindCell = normalizeText(sampleRow[3] ?? '');
      if (/払い|回払|分割|リボ/.test(kindCell)) return 'vpass';
    }
  }

  return 'unknown';
}
