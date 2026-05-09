import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

const charts = [];

const palette = [
  '#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6',
  '#0d9488', '#f97316', '#ec4899', '#0891b2', '#65a30d',
  '#6b7280', '#7c3aed',
];

function colorAt(i) { return palette[i % palette.length]; }

export function destroyCharts() {
  while (charts.length) {
    const c = charts.pop();
    try { c.destroy(); } catch { /* noop */ }
  }
}

// 履歴 (localStorage) の月も含めて、過去推移を描画する。
function unionMonths(agg, history) {
  const set = new Set(agg.months);
  for (const m of Object.keys(history ?? {})) set.add(m);
  return [...set].sort();
}

export function renderCharts(agg, history = {}) {
  const months = unionMonths(agg, history);

  const totalsCanvas = document.getElementById('chartTotals');
  if (totalsCanvas) {
    const income = months.map((m) => agg.summary[m]?._income ?? history?.[m]?.income ?? 0);
    const expense = months.map((m) => agg.summary[m]?._expense ?? history?.[m]?.expense ?? 0);
    const balance = months.map((_, i) => income[i] - expense[i]);
    charts.push(new Chart(totalsCanvas, {
      type: 'bar',
      data: {
        labels: months,
        datasets: [
          { label: '収入', data: income, backgroundColor: '#34a853' },
          { label: '支出', data: expense, backgroundColor: '#ea4335' },
          { label: '収支', type: 'line', data: balance, borderColor: '#1a73e8', backgroundColor: '#1a73e8', tension: 0.2 },
        ],
      },
      options: chartCommon(),
    }));
  }

  const stackedCanvas = document.getElementById('chartStacked');
  if (stackedCanvas) {
    const datasets = agg.categories.map((cat, i) => ({
      label: cat,
      data: months.map((m) => agg.summary[m]?.[cat] ?? history?.[m]?.categorySum?.[cat] ?? 0),
      backgroundColor: colorAt(i),
    }));
    charts.push(new Chart(stackedCanvas, {
      type: 'bar',
      data: { labels: months, datasets },
      options: {
        ...chartCommon(),
        scales: { x: { stacked: true }, y: { stacked: true, ticks: { callback: yenTick } } },
      },
    }));
  }

  const linesCanvas = document.getElementById('chartLines');
  if (linesCanvas) {
    // 主要カテゴリ = 全期間合計 上位 5 カテゴリ
    const totals = {};
    for (const cat of agg.categories) {
      totals[cat] = months.reduce((s, m) => s + (agg.summary[m]?.[cat] ?? history?.[m]?.categorySum?.[cat] ?? 0), 0);
    }
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
    const datasets = top.map((cat, i) => ({
      label: cat,
      data: months.map((m) => agg.summary[m]?.[cat] ?? history?.[m]?.categorySum?.[cat] ?? 0),
      borderColor: colorAt(i),
      backgroundColor: colorAt(i),
      tension: 0.2,
    }));
    charts.push(new Chart(linesCanvas, {
      type: 'line',
      data: { labels: months, datasets },
      options: chartCommon(),
    }));
  }
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

function yenTick(value) {
  return formatYen(value);
}
function formatYen(n) {
  if (n == null) return '';
  return '¥' + Math.round(n).toLocaleString('ja-JP');
}
