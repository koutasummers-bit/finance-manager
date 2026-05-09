// 実機ブラウザに近い環境でアプリを動かし、エンドツーエンドのスモークテストを行う。
// 1) JSDOM で window/document を用意
// 2) localStorage と File API を polyfill
// 3) サンプル CSV をアップロードしたときの一連の処理（パース → 分類 → 重複検出 → 集計 → Excel 生成）を直接実行
// 4) 例外・ワーニングを出力

import { describe, it, expect, beforeAll } from 'vitest';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const fixSmbc = resolve(here, 'fixtures/smbc-sample.csv');
const fixVpass = resolve(here, 'fixtures/vpass-sample.csv');

let parseSmbc, parseVpass, detectFormat, decodeBytes;
let compileRules, categorizeAll;
let findCardWithdrawals, reconcile, applyExclusions;
let aggregate;
let buildWorkbook, writeWorkbookBlob, suggestFileName;
let defaultRules;

beforeAll(async () => {
  // ブラウザ風グローバルを用意
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  // Node 22 の global.navigator は read-only なので、設定可能なプロパティだけ移植する。
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Blob = dom.window.Blob;
  global.localStorage = dom.window.localStorage;

  // 実装モジュールを後から動的import
  ({ parseSmbc } = await import('../src/parser/smbc.js'));
  ({ parseVpass } = await import('../src/parser/vpass.js'));
  ({ detectFormat } = await import('../src/parser/detect.js'));
  ({ decodeBytes } = await import('../src/parser/decode.js'));
  ({ compileRules, categorizeAll } = await import('../src/core/categorize.js'));
  ({ findCardWithdrawals, reconcile, applyExclusions } = await import('../src/core/dedupe.js'));
  ({ aggregate } = await import('../src/core/aggregate.js'));
  ({ buildWorkbook, writeWorkbookBlob, suggestFileName } = await import('../src/output/excel.js'));
  defaultRules = JSON.parse(readFileSync(resolve(here, '../src/rules.default.json'), 'utf-8'));
});

describe('end-to-end pipeline (browser-like)', () => {
  it('processes sample CSVs and produces a non-empty Excel blob', async () => {
    const smbcText = readFileSync(fixSmbc, 'utf-8');
    const vpassText = readFileSync(fixVpass, 'utf-8');

    expect(detectFormat(smbcText, 'smbc-sample.csv')).toBe('smbc');
    expect(detectFormat(vpassText, 'vpass-sample.csv')).toBe('vpass');

    const smbc = parseSmbc(smbcText);
    const vpass = parseVpass(vpassText);
    expect(smbc.errors).toEqual([]);
    expect(vpass.errors).toEqual([]);

    const compiled = compileRules(defaultRules);
    const bank = categorizeAll(smbc.transactions, compiled);
    const card = categorizeAll(vpass.transactions, compiled);

    // すべて分類されていること（"未分類"が極端に多くない）
    const unclassified = bank.filter((t) => t.category === '未分類').length;
    expect(unclassified).toBeLessThan(bank.length); // 全件未分類はおかしい

    // 重複検出
    const candidates = findCardWithdrawals(bank);
    const reconciled = reconcile(candidates, card);
    expect(candidates.length).toBeGreaterThanOrEqual(2); // VPASSヒキオトシ、三井住友カード
    const auto = reconciled.filter((c) => c.autoExclude);
    // 4月の引落45230 と vpass4月合計18560、5月引落38900 と 5月合計5750 で
    // どちらも差額が大きく autoExclude にはならないことを確認
    expect(auto.length).toBe(0);

    const excludedSet = new Set();
    const bankWithExclusions = applyExclusions(bank, excludedSet);
    const agg = aggregate(bankWithExclusions, card);
    expect(agg.months.length).toBeGreaterThan(0);
    expect(agg.totals.grandIncome).toBeGreaterThan(0);
    expect(agg.totals.grandExpense).toBeGreaterThan(0);

    // Excel 生成
    const wb = await buildWorkbook({ bank: bankWithExclusions, card, agg });
    expect(wb.worksheets.length).toBe(4);
    const blob = await writeWorkbookBlob(wb);
    expect(blob.size).toBeGreaterThan(1000);
    expect(blob.type).toContain('spreadsheet');
    expect(suggestFileName(agg.months)).toMatch(/家計簿_\d{6}/);
  });

  it('main.js loads in JSDOM without throwing on import', async () => {
    // 副作用 (DOM への addEventListener) が走るので最低限のターゲット要素を準備
    document.body.innerHTML = `
      <div id="dropzone"></div>
      <input id="fileInput" type="file" />
      <ul id="fileList"></ul>
      <button id="processBtn"></button>
      <button id="clearFilesBtn"></button>
      <div id="parseErrors"></div>
      <section id="dedupe"></section>
      <table id="dedupeTable"><tbody></tbody></table>
      <section id="summary"></section>
      <div id="summaryNumbers"></div>
      <canvas id="chartTotals"></canvas>
      <canvas id="chartStacked"></canvas>
      <canvas id="chartLines"></canvas>
      <button id="downloadBtn"></button>
      <button id="saveHistoryBtn"></button>
      <input id="rulesInput" type="file" />
      <p id="rulesStatus"></p>
      <button id="resetRulesBtn"></button>
      <button id="clearHistoryBtn"></button>
      <p id="historyStatus"></p>
    `;
    // import 自体が成功するかだけ確認
    await expect(import('../src/main.js')).resolves.toBeDefined();
  });
});
