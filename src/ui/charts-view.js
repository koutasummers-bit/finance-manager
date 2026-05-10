import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const charts = [];

const palette = [
  '#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6',
  '#0d9488', '#f97316', '#ec4899', '#0891b2', '#65a30d',
  '#6b7280', '#7c3aed', '#dc2626', '#059669', '#d97706',
];

function colorAt(i) { return palette[i % palette.length]; }

export function destroyCharts() {
  while (charts.length) {
    const c = charts.pop();
    try { c.destroy(); } catch { /* noop */ }
  }
}

function unionMonths(agg, history) {
  const set = new Set(agg.months);
  for (const m of Object.keys(history ?? {})) set.add(m);
  return [...set].sort();
}

// 期間中のカテゴリ別純額(支出)を高い順に並べた配列を返す。
function categoryTotalsSorted(agg) {
  const totals = {};
  for (const cat of agg.categories) {
    totals[cat] = agg.months.reduce((s, m) => s + Math.max(0, agg.summary[m]?.[cat] ?? 0), 0);
  }
  return Object.entries(totals).sort((a, b) => b[1] - a[1]);
}

export function renderCharts(agg, history = {}) {
  const months = unionMonths(agg, history);
  renderTotalsChart(agg, history, months);
  renderPieChart(agg);
  renderStackedChart(agg, history, months);
  renderLinesChart(agg, history, months);
}

function renderTotalsChart(agg, history, months) {
  const canvas = document.getElementById('chartTotals');
  if (!canvas) return;
  const income = months.map((m) => agg.summary[m]?._income ?? history?.[m]?.income ?? 0);
  const expense = months.map((m) => agg.summary[m]?._expense ?? history?.[m]?.expense ?? 0);
  const balance = months.map((_, i) => income[i] - expense[i]);
  charts.push(new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months,
      datasets: [
        { label: '収入', data: income, backgroundColor: '#34a853', order: 2 },
        { label: '支出', data: expense, backgroundColor: '#ea4335', order: 2 },
        { label: '収支', type: 'line', data: balance, borderColor: '#1a73e8', backgroundColor: '#1a73e8', tension: 0.2, order: 1, borderWidth: 2.5 },
      ],
    },
    options: chartCommon(),
  }));
}

function renderPieChart(agg) {
  const canvas = document.getElementById('chartPie');
  if (!canvas) return;
  const sorted = categoryTotalsSorted(agg);
  if (sorted.length === 0) return;

  // 上位 8 + その他 でまとめて見やすくする
  const top = sorted.slice(0, 8);
  const rest = sorted.slice(8);
  const labels = top.map(([k]) => k);
  const data = top.map(([, v]) => v);
  if (rest.length > 0) {
    labels.push(`その他 (${rest.length}カテゴリ)`);
    data.push(rest.reduce((s, [, v]) => s + v, 0));
  }
  const total = data.reduce((s, v) => s + v, 0);

  charts.push(new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: labels.map((_, i) => colorAt(i)),
        borderWidth: 1,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '55%',
      plugins: {
        legend: {
          position: 'right',
          labels: {
            boxWidth: 14,
            generateLabels(chart) {
              const ds = chart.data.datasets[0];
              return chart.data.labels.map((label, i) => {
                const v = ds.data[i] ?? 0;
                const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
                return {
                  text: `${label}  ¥${v.toLocaleString('ja-JP')} (${pct}%)`,
                  fillStyle: ds.backgroundColor[i],
                  index: i,
                };
              });
            },
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const v = ctx.parsed;
              const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0';
              return `${ctx.label}: ¥${v.toLocaleString('ja-JP')} (${pct}%)`;
            },
          },
        },
      },
    },
  }));
}

function renderStackedChart(agg, history, months) {
  const canvas = document.getElementById('chartStacked');
  if (!canvas) return;

  // 上位 8 カテゴリ + その他 で集約 (積み上げ過多を防ぐ)
  const sorted = categoryTotalsSorted(agg);
  const top = sorted.slice(0, 8).map(([k]) => k);
  const others = sorted.slice(8).map(([k]) => k);

  const datasets = top.map((cat, i) => ({
    label: cat,
    data: months.map((m) => Math.max(0, agg.summary[m]?.[cat] ?? history?.[m]?.categorySum?.[cat] ?? 0)),
    backgroundColor: colorAt(i),
  }));
  if (others.length > 0) {
    datasets.push({
      label: 'その他',
      data: months.map((m) => others.reduce((s, c) => s + Math.max(0, agg.summary[m]?.[c] ?? history?.[m]?.categorySum?.[c] ?? 0), 0)),
      backgroundColor: colorAt(top.length),
    });
  }

  charts.push(new Chart(canvas, {
    type: 'bar',
    data: { labels: months, datasets },
    options: {
      ...chartCommon(),
      scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: yenTick } } },
      plugins: {
        ...chartCommon().plugins,
        legend: { position: 'bottom', labels: { boxWidth: 12, padding: 8 } },
      },
    },
  }));
}

function renderLinesChart(agg, history, months) {
  const canvas = document.getElementById('chartLines');
  if (!canvas) return;

  const sorted = categoryTotalsSorted(agg);
  const top = sorted.slice(0, 5).map(([k]) => k);
  const datasets = top.map((cat, i) => ({
    label: cat,
    data: months.map((m) => Math.max(0, agg.summary[m]?.[cat] ?? history?.[m]?.categorySum?.[cat] ?? 0)),
    borderColor: colorAt(i),
    backgroundColor: colorAt(i),
    tension: 0.25,
    borderWidth: 2,
  }));
  charts.push(new Chart(canvas, {
    type: 'line',
    data: { labels: months, datasets },
    options: chartCommon(),
  }));
}

function chartCommon() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { intersect: false, mode: 'index' },
    plugins: {
      legend: { position: 'bottom', labels: { boxWidth: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => `${ctx.dataset.label}: ${formatYen(ctx.parsed.y ?? ctx.parsed)}`,
        },
      },
    },
    scales: { y: { ticks: { callback: yenTick } } },
  };
}

function yenTick(value) { return formatYen(value); }
function formatYen(n) {
  if (n == null) return '';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}

// Excel 埋め込み用に各キャンバスを PNG ArrayBuffer として収集する。
// チャートが描画されていない (canvas 不在 or 空) 場合はスキップ。
export async function collectChartImages() {
  const ids = ['chartTotals', 'chartPie', 'chartStacked', 'chartLines'];
  const titles = {
    chartTotals: '月次 収入・支出・収支',
    chartPie: '支出カテゴリ構成 (期間合計)',
    chartStacked: 'カテゴリ別 月次推移 (積み上げ)',
    chartLines: '主要カテゴリ 推移',
  };
  const out = [];
  for (const id of ids) {
    const canvas = document.getElementById(id);
    if (!canvas || canvas.width === 0) continue;
    const blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
    if (!blob) continue;
    out.push({ id, title: titles[id] ?? id, buffer: await blob.arrayBuffer() });
  }
  return out;
}
