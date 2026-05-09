// 本番ビルド成果物 (dist/) を JSDOM 上で読み込み、スクリプトを実行して
// ブラウザに近い環境で例外が発生しないか確認する。
// CI 用ではなくローカルデバッグ用のスクリプト。
//
// 実行: node scripts/jsdom-runtime-check.mjs

import jsdom from 'jsdom';
const { JSDOM } = jsdom;
import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const distDir = resolve(here, '../dist');

if (!existsSync(distDir)) {
  console.error('[FAIL] dist/ が存在しません。先に `npm run build` を実行してください');
  process.exit(1);
}

const html = readFileSync(join(distDir, 'index.html'), 'utf-8');
const baseUrl = pathToFileURL(join(distDir, 'index.html')).href;

const errors = [];
const warnings = [];

const dom = new JSDOM(html, {
  url: baseUrl,
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  beforeParse(window) {
    window.console.error = (...args) => { errors.push(args.map(String).join(' ')); };
    window.console.warn = (...args) => { warnings.push(args.map(String).join(' ')); };
    window.addEventListener('error', (e) => { errors.push(`window.error: ${e.message}`); });
    window.addEventListener('unhandledrejection', (e) => {
      errors.push(`unhandledrejection: ${e.reason?.message ?? e.reason}`);
    });
  },
});

// スクリプトの読み込み・実行を待つ
await new Promise((res) => setTimeout(res, 1500));

const win = dom.window;
const doc = win.document;

console.log('--- DOM check ---');
console.log('title:', doc.title);
console.log('h1:', doc.querySelector('h1')?.textContent);
console.log('dropzone present:', !!doc.querySelector('#dropzone'));
console.log('process button disabled:', doc.querySelector('#processBtn')?.disabled);
console.log('chart canvases:',
  ['#chartTotals', '#chartStacked', '#chartLines'].map((s) => !!doc.querySelector(s)));

console.log('\n--- Asset size check ---');
const assets = ['assets/index-DJ-s6Q7J.js', 'assets/exceljs-sGGcTBZL.js', 'assets/chart-Zj-L_LRF.js', 'assets/papaparse-Bk4gEjOa.js', 'assets/index-DkePZu9B.css'];
for (const a of assets) {
  const p = join(distDir, a);
  if (existsSync(p)) {
    console.log(`  ${a}: ${statSync(p).size} bytes`);
  } else {
    // ハッシュは毎回変わるので、存在しなくても致命ではない（HTML 側を見れば良い）
    console.log(`  ${a}: NOT FOUND (filename is hashed; check dist/index.html)`);
  }
}

console.log('\n--- Errors during script execution ---');
if (errors.length === 0) console.log('  (none)');
else errors.forEach((e) => console.log('  [ERR]', e));

console.log('\n--- Warnings ---');
if (warnings.length === 0) console.log('  (none)');
else warnings.forEach((w) => console.log('  [WARN]', w));

dom.window.close();
process.exit(errors.length > 0 ? 1 : 0);
