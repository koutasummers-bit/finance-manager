// 文字列・金額の正規化ヘルパ。
// SMBC/VPass の CSV は全角英数や全角スペースが混在するため、NFKC で正規化してから判定する。

export function normalizeText(value) {
  if (value == null) return '';
  return String(value).normalize('NFKC').trim();
}

const DATE_RE = /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/;

export function isDateString(value) {
  return DATE_RE.test(normalizeText(value));
}

export function toIsoDate(value) {
  const m = DATE_RE.exec(normalizeText(value));
  if (!m) return null;
  const yyyy = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function parseAmount(value) {
  if (value == null) return null;
  const s = normalizeText(value).replace(/,/g, '').replace(/¥/g, '');
  if (s === '' || s === '-') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function monthKey(isoDate) {
  return isoDate ? isoDate.slice(0, 7) : '';
}
