// ユーザーが提供した実 CSV をパイプラインに通して挙動を確認するスクリプト。
// このスクリプトは個人ファイルパスを参照するため、CI には組み込まない (リポジトリにもデータは残さない)。

import { readFileSync } from 'node:fs';
import { decodeBytes } from '../src/parser/decode.js';
import { detectFormat } from '../src/parser/detect.js';
import { parseSmbc } from '../src/parser/smbc.js';
import { parseVpass } from '../src/parser/vpass.js';
import { compileRules, categorizeAll } from '../src/core/categorize.js';
import { findCardWithdrawals, reconcile, applyExclusions } from '../src/core/dedupe.js';
import { aggregate } from '../src/core/aggregate.js';
import { buildWorkbook, writeWorkbookBlob, suggestFileName } from '../src/output/excel.js';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/check-real-files.mjs <csv1> [<csv2>...]');
  process.exit(1);
}

const defaultRules = JSON.parse(readFileSync(new URL('../src/rules.default.json', import.meta.url), 'utf-8'));
const compiled = compileRules(defaultRules);

const banks = [];
const cards = [];

for (const path of files) {
  const buf = readFileSync(path);
  const text = decodeBytes(buf);
  const fmt = detectFormat(text, path);
  console.log(`\n=== ${path} ===`);
  console.log(`format: ${fmt}, size: ${buf.length} bytes, first line: ${text.split('\n')[0]?.slice(0, 80)}`);

  let parsed;
  if (fmt === 'smbc') parsed = parseSmbc(text);
  else if (fmt === 'vpass') parsed = parseVpass(text);
  else {
    console.log('  format unknown, skipping');
    continue;
  }
  console.log(`  parsed: ${parsed.transactions.length} transactions, errors: ${parsed.errors.length}`);
  if (parsed.errors.length > 0) parsed.errors.slice(0, 5).forEach((e) => console.log('    [err]', e));

  const annotated = categorizeAll(parsed.transactions, compiled);
  console.log('  first 3 transactions:');
  for (const t of annotated.slice(0, 3)) {
    console.log(`    ${t.date} | ${t.amount} | ${t.description} | -> ${t.category}${t.subcategory ? '/' + t.subcategory : ''}`);
  }
  console.log('  category counts:');
  const counts = {};
  for (const t of annotated) counts[t.category] = (counts[t.category] ?? 0) + 1;
  for (const [k, v] of Object.entries(counts)) console.log(`    ${k}: ${v}`);

  if (fmt === 'smbc') banks.push(...annotated);
  else cards.push(...annotated);
}

if (banks.length === 0 && cards.length === 0) {
  console.log('\nno transactions parsed');
  process.exit(0);
}

console.log('\n=== Dedupe ===');
const candidates = findCardWithdrawals(banks);
const reconciled = reconcile(candidates, cards);
for (const c of reconciled) {
  console.log(
    `  ${c.date} | ${c.description} | -${c.amount} | matched(${c.matchedMonth})=${c.matchedTotal} | diff=${c.diff} | auto=${c.autoExclude}`
  );
}

const excluded = new Set(reconciled.filter((c) => c.autoExclude).map((c) => c.bankIndex));
const bankWithExclusions = applyExclusions(banks, excluded);

const agg = aggregate(bankWithExclusions, cards);
console.log('\n=== Aggregation ===');
console.log('  months:', agg.months);
console.log('  income categories:', agg.incomeCategories);
console.log('  expense categories:', agg.categories);
console.log('  totals:', agg.totals);
for (const m of agg.months) {
  console.log(`  ${m}: income=${agg.summary[m]._income} expense=${agg.summary[m]._expense} balance=${agg.summary[m]._balance}`);
}

console.log('\n=== Excel ===');
const wb = await buildWorkbook({ bank: bankWithExclusions, card: cards, agg });
const blob = await writeWorkbookBlob(wb);
console.log(`  generated ${suggestFileName(agg.months)} (${blob.size} bytes, ${wb.worksheets.length} sheets)`);
