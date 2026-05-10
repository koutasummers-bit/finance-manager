import { decodeFile } from './parser/decode.js';
import { detectFormat } from './parser/detect.js';
import { parseSmbc } from './parser/smbc.js';
import { parseVpass } from './parser/vpass.js';
import { compileRules, categorizeAll } from './core/categorize.js';
import { findCardWithdrawals, reconcile, applyExclusions } from './core/dedupe.js';
import { aggregate, sourceBreakdown } from './core/aggregate.js';
import { generateAdvice } from './core/advisor.js';
import { monthKey } from './core/normalize.js';
import { buildWorkbook, writeWorkbookBlob, suggestFileName } from './output/excel.js';
import { saveAggregation, clearHistory, getHistory } from './storage/history.js';
import defaultRules from './rules.default.json';
import { renderCharts, destroyCharts, collectChartImages } from './ui/charts-view.js';
import { renderCategoryTable, renderTopTxTable, renderMonthlyTable } from './ui/detail-tables.js';

// アプリケーション状態 (シンプルさ優先で単一オブジェクト)。
const state = {
  files: [],          // [{ file, format, transactions, errors }]
  rules: defaultRules,
  bank: [],           // categorized
  card: [],           // categorized
  candidates: [],
  excluded: new Set(),
  agg: null,
  // 計算期間 (どちらも 'YYYY-MM' or null = 制限なし)
  period: { from: null, to: null },
  availableMonths: [],
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
const dedupeUncheckAllBtn = $('#dedupeUncheckAllBtn');
const dedupeCheckAllBtn = $('#dedupeCheckAllBtn');
const dedupeResetBtn = $('#dedupeResetBtn');
const periodSection = $('#period');
const periodInfo = $('#periodInfo');
const periodPresets = $('#periodPresets');
const periodFromInput = $('#periodFrom');
const periodToInput = $('#periodTo');
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

// ---- 計算期間フィルタ ----

function filterByPeriod(transactions, period) {
  if (!period || (!period.from && !period.to)) return transactions;
  return transactions.filter((t) => {
    const m = monthKey(t.date);
    if (!m) return false;
    if (period.from && m < period.from) return false;
    if (period.to && m > period.to) return false;
    return true;
  });
}

function shiftMonth(yyyymm, deltaMonths) {
  const [y, mo] = yyyymm.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + deltaMonths, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function applyPeriodPreset(preset) {
  if (state.availableMonths.length === 0) return { from: null, to: null };
  const min = state.availableMonths[0];
  const max = state.availableMonths[state.availableMonths.length - 1];
  switch (preset) {
    case 'all': return { from: null, to: null };
    case '3m': return { from: shiftMonth(max, -2), to: max };
    case '6m': return { from: shiftMonth(max, -5), to: max };
    case '12m': return { from: shiftMonth(max, -11), to: max };
    case 'ytd': {
      const year = max.split('-')[0];
      return { from: `${year}-01`, to: max };
    }
    default: return { from: min, to: max };
  }
}

function refreshPeriodUI() {
  if (state.availableMonths.length === 0) {
    periodSection.classList.add('hidden');
    return;
  }
  periodSection.classList.remove('hidden');
  const min = state.availableMonths[0];
  const max = state.availableMonths[state.availableMonths.length - 1];
  const monthsCount = state.availableMonths.length;

  periodFromInput.min = min;
  periodFromInput.max = max;
  periodToInput.min = min;
  periodToInput.max = max;
  periodFromInput.value = state.period.from ?? min;
  periodToInput.value = state.period.to ?? max;

  const effFrom = state.period.from ?? min;
  const effTo = state.period.to ?? max;
  const effCount = state.availableMonths.filter((m) => m >= effFrom && m <= effTo).length;
  periodInfo.textContent = `データ全期間: ${min} 〜 ${max} (${monthsCount}ヶ月) / 集計対象: ${effFrom} 〜 ${effTo} (${effCount}ヶ月)`;
}

periodPresets?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-preset]');
  if (!btn) return;
  state.period = applyPeriodPreset(btn.dataset.preset);
  refreshPeriodUI();
  recomputeAggregation();
});

periodFromInput?.addEventListener('change', () => {
  state.period.from = periodFromInput.value || null;
  if (state.period.from && state.period.to && state.period.from > state.period.to) {
    state.period.to = state.period.from;
  }
  refreshPeriodUI();
  recomputeAggregation();
});
periodToInput?.addEventListener('change', () => {
  state.period.to = periodToInput.value || null;
  if (state.period.from && state.period.to && state.period.from > state.period.to) {
    state.period.from = state.period.to;
  }
  refreshPeriodUI();
  recomputeAggregation();
});

// ---- 重複除外パネルの一括操作 ----

dedupeUncheckAllBtn?.addEventListener('click', () => {
  state.excluded.clear();
  renderDedupe();
  recomputeAggregation();
});
dedupeCheckAllBtn?.addEventListener('click', () => {
  state.excluded = new Set(state.candidates.map((c) => c.bankIndex));
  renderDedupe();
  recomputeAggregation();
});
dedupeResetBtn?.addEventListener('click', () => {
  state.excluded = new Set(
    state.candidates.filter((c) => c.autoExclude).map((c) => c.bankIndex)
  );
  renderDedupe();
  recomputeAggregation();
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

  // 利用可能な月の範囲を再計算し、計算期間UIを準備する
  const monthsSet = new Set();
  for (const t of [...state.bank, ...state.card]) {
    const m = monthKey(t.date);
    if (m) monthsSet.add(m);
  }
  state.availableMonths = [...monthsSet].sort();
  // 既存の期間がある場合は範囲内に丸める。なければ全期間。
  if (state.availableMonths.length > 0) {
    const min = state.availableMonths[0];
    const max = state.availableMonths[state.availableMonths.length - 1];
    if (state.period.from && state.period.from < min) state.period.from = min;
    if (state.period.from && state.period.from > max) state.period.from = null;
    if (state.period.to && state.period.to > max) state.period.to = max;
    if (state.period.to && state.period.to < min) state.period.to = null;
  } else {
    state.period = { from: null, to: null };
  }
  refreshPeriodUI();

  renderDedupe();
  recomputeAggregation();
}

function recomputeAggregation() {
  const bank = applyExclusions(state.bank, state.excluded);
  const filteredBank = filterByPeriod(bank, state.period);
  const filteredCard = filterByPeriod(state.card, state.period);
  state.agg = aggregate(filteredBank, filteredCard);
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

function renderAdvice(container, advice) {
  container.innerHTML = '';
  if (!advice || advice.length === 0) {
    container.innerHTML = '<div class="advice-empty">特に気になる変化はありません。順調です 👍</div>';
    return;
  }
  for (const a of advice) {
    const card = document.createElement('div');
    card.className = `advice-card ${a.severity}`;
    card.innerHTML =
      `<div class="icon">${a.icon ?? ''}</div>` +
      `<div class="body">` +
      `<div class="title">${escapeHtml(a.title)}</div>` +
      (a.detail ? `<div class="detail">${escapeHtml(a.detail)}</div>` : '') +
      `</div>`;
    container.appendChild(card);
  }
}

function renderSummary(agg) {
  summarySection.classList.remove('hidden');
  const bankWithExclusions = applyExclusions(state.bank, state.excluded);
  const filteredBank = filterByPeriod(bankWithExclusions, state.period);
  const filteredCard = filterByPeriod(state.card, state.period);
  const breakdown = sourceBreakdown(filteredBank, filteredCard);

  const totalIncome = agg.totals.grandIncome;
  const totalExpense = agg.totals.grandExpense;
  const balance = totalIncome - totalExpense;

  summaryNumbersEl.innerHTML = '';
  const items = [
    { label: '対象月数', value: `${agg.months.length} ヶ月` },
    {
      label: '収入合計',
      value: fmtYen(totalIncome),
      sub: `銀行: ${fmtYen(breakdown.totals.bank.income)}`,
      cls: 'positive',
    },
    {
      label: '支出合計',
      value: fmtYen(totalExpense),
      sub: `銀行: ${fmtYen(breakdown.totals.bank.expense)} / カード: ${fmtYen(breakdown.totals.card.expense)}`,
      cls: 'negative',
    },
    { label: '収支', value: fmtYen(balance), cls: balance >= 0 ? 'positive' : 'negative' },
  ];
  for (const it of items) {
    const div = document.createElement('div');
    div.className = 'item';
    const sub = it.sub ? `<div class="sub">${it.sub}</div>` : '';
    div.innerHTML = `<div class="label">${it.label}</div><div class="value ${it.cls ?? ''}">${it.value}</div>${sub}`;
    summaryNumbersEl.appendChild(div);
  }

  destroyCharts();
  renderCharts(agg, getHistory());

  // アドバイス
  const adviceList = document.getElementById('adviceList');
  if (adviceList) renderAdvice(adviceList, generateAdvice(agg));

  // 詳細テーブル
  const monthlyTable = document.getElementById('monthlyTable');
  if (monthlyTable) renderMonthlyTable(monthlyTable, agg, breakdown.byMonth);

  const allTx = [...filteredBank, ...filteredCard];
  const expenseCatTable = document.getElementById('expenseCatTable');
  if (expenseCatTable) renderCategoryTable(expenseCatTable, agg, 'expense', allTx);

  const incomeCatTable = document.getElementById('incomeCatTable');
  if (incomeCatTable) renderCategoryTable(incomeCatTable, agg, 'income', allTx);

  const topTxTable = document.getElementById('topTxTable');
  if (topTxTable) {
    renderTopTxTable(topTxTable, allTx, 20);
  }
}

downloadBtn.addEventListener('click', async () => {
  if (!state.agg) return;
  downloadBtn.disabled = true;
  downloadBtn.textContent = 'Excel生成中...';
  try {
    const bank = applyExclusions(state.bank, state.excluded);
    const filteredBank = filterByPeriod(bank, state.period);
    const filteredCard = filterByPeriod(state.card, state.period);
    const breakdown = sourceBreakdown(filteredBank, filteredCard);
    const advice = generateAdvice(state.agg);
    // 現在画面に描画されているグラフを PNG として収集し、Excel のダッシュボードに埋め込む
    const chartImages = await collectChartImages();
    const wb = await buildWorkbook({
      bank: filteredBank,
      card: filteredCard,
      agg: state.agg,
      chartImages,
      breakdown,
      advice,
    });
    const blob = await writeWorkbookBlob(wb);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = suggestFileName(state.agg.months);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    downloadBtn.disabled = false;
    downloadBtn.textContent = 'Excel(.xlsx) をダウンロード（グラフ入り）';
  }
});
