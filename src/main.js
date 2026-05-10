import { decodeFile } from './parser/decode.js';
import { detectFormat } from './parser/detect.js';
import { parseSmbc } from './parser/smbc.js';
import { parseVpass } from './parser/vpass.js';
import { compileRules, categorizeAll } from './core/categorize.js';
import { findCardWithdrawals, reconcile, applyExclusions } from './core/dedupe.js';
import { aggregate } from './core/aggregate.js';
import { buildWorkbook, writeWorkbookBlob, suggestFileName } from './output/excel.js';
import { saveAggregation, clearHistory, getHistory } from './storage/history.js';
import defaultRules from './rules.default.json';
import { renderCharts, destroyCharts } from './ui/charts-view.js';

// アプリケーション状態 (シンプルさ優先で単一オブジェクト)。
const state = {
  files: [],          // [{ file, format, transactions, errors }]
  rules: defaultRules,
  bank: [],           // categorized
  card: [],           // categorized
  candidates: [],
  excluded: new Set(),
  agg: null,
};

const $ = (sel) => document.querySelector(sel);

const dropzone = $('#dropzone');
const fileInput = $('#fileInput');
const fileListEl = $('#fileList');
const processBtn = $('#processBtn');
const clearFilesBtn = $('#clearFilesBtn');
const parseErrorsEl = $('#parseErrors');
const dedupeSection = $('#dedupe');
const dedupeBody = $('#dedupeTable tbody');
const summarySection = $('#summary');
const summaryNumbersEl = $('#summaryNumbers');
const downloadBtn = $('#downloadBtn');
const saveHistoryBtn = $('#saveHistoryBtn');
const rulesInput = $('#rulesInput');
const rulesStatus = $('#rulesStatus');
const resetRulesBtn = $('#resetRulesBtn');
const clearHistoryBtn = $('#clearHistoryBtn');
const historyStatus = $('#historyStatus');

function fmtYen(n) {
  if (n == null || Number.isNaN(n)) return '-';
  const v = Math.round(n);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

// ---- ファイル受け取り ----

dropzone.addEventListener('click', () => fileInput.click());
dropzone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
});
['dragenter', 'dragover'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', (e) => handleFiles([...e.dataTransfer.files]));
fileInput.addEventListener('change', (e) => handleFiles([...e.target.files]));
clearFilesBtn.addEventListener('click', () => {
  state.files = [];
  renderFileList();
  parseErrorsEl.textContent = '';
});

async function handleFiles(files) {
  for (const file of files) {
    // 拡張子が .csv でなくても中身を見て判別する。バイナリ等は decode/parse で
    // エラーを返し、UI 上に表示する。
    try {
      const text = await decodeFile(file);
      const format = detectFormat(text, file.name);
      let parsed;
      if (format === 'smbc') parsed = parseSmbc(text);
      else if (format === 'vpass') parsed = parseVpass(text);
      else parsed = { transactions: [], errors: [`形式を判定できません: ${file.name} (上のセレクタから手動で SMBC / VPass を指定できます)`] };
      state.files.push({ file, format, transactions: parsed.transactions, errors: parsed.errors });
    } catch (err) {
      state.files.push({ file, format: 'unknown', transactions: [], errors: [`${file.name}: ${String(err)}`] });
    }
  }
  renderFileList();
}

function renderFileList() {
  fileListEl.innerHTML = '';
  for (const [i, entry] of state.files.entries()) {
    const li = document.createElement('li');
    const left = document.createElement('div');
    const badge = document.createElement('span');
    badge.className = `badge ${entry.format}`;
    badge.textContent = entry.format.toUpperCase();
    const name = document.createElement('span');
    name.textContent = `${entry.file.name} (${entry.transactions.length}件)`;
    left.append(badge, name);

    const select = document.createElement('select');
    for (const f of ['smbc', 'vpass', 'unknown']) {
      const opt = document.createElement('option');
      opt.value = f;
      opt.textContent = f.toUpperCase();
      if (f === entry.format) opt.selected = true;
      select.appendChild(opt);
    }
    select.addEventListener('change', async () => {
      entry.format = select.value;
      const text = await decodeFile(entry.file);
      let parsed = { transactions: [], errors: ['形式が unknown のため解析しません'] };
      if (entry.format === 'smbc') parsed = parseSmbc(text);
      else if (entry.format === 'vpass') parsed = parseVpass(text);
      entry.transactions = parsed.transactions;
      entry.errors = parsed.errors;
      renderFileList();
    });

    const remove = document.createElement('button');
    remove.className = 'secondary';
    remove.textContent = '削除';
    remove.addEventListener('click', () => {
      state.files.splice(i, 1);
      renderFileList();
    });

    li.append(left, select, remove);
    fileListEl.appendChild(li);
  }
  processBtn.disabled = state.files.length === 0;
  parseErrorsEl.textContent = state.files.flatMap((f) => f.errors).join('\n');
}

// ---- ルール差し替え ----

rulesInput.addEventListener('change', async (e) => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const text = await f.text();
    state.rules = JSON.parse(text);
    rulesStatus.textContent = `ルールを読み込みました (${state.rules.rules?.length ?? 0}件)`;
  } catch (err) {
    rulesStatus.textContent = `読み込み失敗: ${err.message}`;
  }
});
resetRulesBtn.addEventListener('click', () => {
  state.rules = defaultRules;
  rulesStatus.textContent = 'デフォルトルールに戻しました';
});

// ---- 履歴消去 ----

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('履歴を全て消去します。よろしいですか？')) {
    clearHistory();
    historyStatus.textContent = '履歴を消去しました';
  }
});

saveHistoryBtn.addEventListener('click', () => {
  if (!state.agg) return;
  saveAggregation(state.agg);
  historyStatus.textContent = `${state.agg.months.length}ヶ月分を履歴に保存しました`;
});

// ---- 集計実行 ----

processBtn.addEventListener('click', () => runProcessing());

function runProcessing() {
  const compiled = compileRules(state.rules);
  const allBank = state.files.filter((f) => f.format === 'smbc').flatMap((f) => f.transactions);
  const allCard = state.files.filter((f) => f.format === 'vpass').flatMap((f) => f.transactions);
  state.bank = categorizeAll(allBank, compiled);
  state.card = categorizeAll(allCard, compiled);

  const candidates = findCardWithdrawals(state.bank);
  state.candidates = reconcile(candidates, state.card);

  state.excluded = new Set(
    state.candidates.filter((c) => c.autoExclude).map((c) => c.bankIndex)
  );

  renderDedupe();
  recomputeAggregation();
}

function recomputeAggregation() {
  const bank = applyExclusions(state.bank, state.excluded);
  state.agg = aggregate(bank, state.card);
  renderSummary(state.agg);
}

function renderDedupe() {
  dedupeBody.innerHTML = '';
  if (state.candidates.length === 0) {
    dedupeSection.classList.remove('hidden');
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="7" class="hint">VPass引落候補は検出されませんでした。</td>';
    dedupeBody.appendChild(tr);
    return;
  }
  dedupeSection.classList.remove('hidden');
  for (const c of state.candidates) {
    const tr = document.createElement('tr');
    if (c.autoExclude) tr.className = 'auto-exclude';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = state.excluded.has(c.bankIndex);
    cb.addEventListener('change', () => {
      if (cb.checked) state.excluded.add(c.bankIndex);
      else state.excluded.delete(c.bankIndex);
      recomputeAggregation();
    });
    const td0 = document.createElement('td'); td0.appendChild(cb);
    tr.appendChild(td0);
    tr.insertAdjacentHTML('beforeend',
      `<td>${c.date}</td><td>${escapeHtml(c.description)}</td>` +
      `<td class="num">${fmtYen(c.amount)}</td>` +
      `<td class="num">${c.matchedTotal ? fmtYen(c.matchedTotal) : '-'} <span class="hint">(${c.matchedMonth ?? ''})</span></td>` +
      `<td class="num">${fmtYen(c.diff)}</td>` +
      `<td>${c.autoExclude ? '自動除外' : '手動確認'}</td>`
    );
    dedupeBody.appendChild(tr);
  }
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

function renderSummary(agg) {
  summarySection.classList.remove('hidden');
  const totalIncome = agg.totals.grandIncome;
  const totalExpense = agg.totals.grandExpense;
  const balance = totalIncome - totalExpense;

  summaryNumbersEl.innerHTML = '';
  const items = [
    { label: '対象月数', value: `${agg.months.length} ヶ月` },
    { label: '収入合計', value: fmtYen(totalIncome), cls: 'positive' },
    { label: '支出合計', value: fmtYen(totalExpense), cls: 'negative' },
    { label: '収支', value: fmtYen(balance), cls: balance >= 0 ? 'positive' : 'negative' },
  ];
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'item';
    div.innerHTML = `<div class="label">${it.label}</div><div class="value ${it.cls ?? ''}">${it.value}</div>`;
    summaryNumbersEl.appendChild(div);
  }

  destroyCharts();
  renderCharts(agg, getHistory());
}

downloadBtn.addEventListener('click', async () => {
  if (!state.agg) return;
  const bank = applyExclusions(state.bank, state.excluded);
  const wb = await buildWorkbook({ bank, card: state.card, agg: state.agg });
  const blob = await writeWorkbookBlob(wb);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestFileName(state.agg.months);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
