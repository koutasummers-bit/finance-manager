import Papa from 'papaparse';
import { normalizeText } from '../core/normalize.js';

// CSV のフォーマットを SMBC / VPass / unknown のいずれかに判定する。
// 1) ファイル名のヒント、2) ヘッダ文字列、3) マスクされたカード番号、
// 4) データ行の列構成 (3列目が小整数なら VPass、テキストなら SMBC) で判定。

const SMBC_HINTS = ['年月日', 'お引出', 'お預入', 'お取り扱い'];
const VPASS_HINTS = ['ご利用店名', 'ご利用日', '支払区分', '一回払い', '1回払い', '分割払い', 'リボ払い'];

// マスクされたクレジットカード番号 (例: "1110-00**-****-****")
const CARD_MASK_RE = /\d{2,4}[-\s]?[\d*]{0,4}\*{2,}/;

export function detectFormat(text, fileName = '') {
  const name = fileName.toLowerCase();
  if (/vpass|smcc|smbccard|smbc-card/.test(name)) return 'vpass';
  if (/meisai|kouza|smbc(?!card)|mitui|mitsui/.test(name)) return 'smbc';

  const result = Papa.parse(text, { header: false, skipEmptyLines: 'greedy' });
  const rows = (result.data || []).slice(0, 30);
  const flat = rows.flat().map(normalizeText).join('|');

  if (SMBC_HINTS.some((h) => flat.includes(h))) return 'smbc';
  if (VPASS_HINTS.some((h) => flat.includes(h))) return 'vpass';

  // VPass のカード名義人行にはマスクされたカード番号 (****) が含まれる
  if (rows.some((r) => r.some((c) => CARD_MASK_RE.test(normalizeText(c))))) return 'vpass';

  // データ行から判定:
  //   SMBC: 列 4 (お取り扱い内容) はテキスト、列 5 (残高) は大きな整数
  //   VPass: 列 4 (支払区分) は 1〜9 程度の小整数
  const dataRow = rows.find((r) => r.length >= 5 && /^\d{4}/.test(normalizeText(r[0] ?? '')));
  if (dataRow) {
    const c3 = normalizeText(dataRow[3] ?? '');
    if (/^\d{1,2}$/.test(c3)) return 'vpass';
    if (c3 && !/^\d+$/.test(c3)) return 'smbc';
    // 6 列ピッタリで先頭日付なら SMBC を疑う (お取り扱い内容が空のレアケース)
    if (dataRow.length === 6) return 'smbc';
  }

  return 'unknown';
}
