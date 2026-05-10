// カテゴリ別クロス集計テーブルと「高額支出 TOP N」テーブルを描画するモジュール。
// 集計は aggregate.js の結果 (summary[month][category]) を直接使う。

function fmtYen(n) {
  if (n == null || Number.isNaN(n)) return '-';
  const v = Math.round(n);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

function fmtPct(n) {
  if (!Number.isFinite(n)) return '-';
  return (n * 100).toFixed(1) + '%';
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// カテゴリ × 月のクロス集計テーブル。
// rows = カテゴリ、cols = 月、合計列・月平均・構成比を末尾に追加。
// ヘッダクリックでソート可能。
export function renderCategoryTable(table, agg, kind = 'expense') {
  // expense: 支出カテゴリ、income: 収入カテゴリ
  const cats = kind === 'income' ? agg.incomeCategories : agg.categories;
  const months = agg.months;
  const grandTotal = cats.reduce(
    (s, c) => s + months.reduce((s2, m) => s2 + Math.max(0, agg.summary[m]?.[c] ?? 0), 0),
    0
  );

  const rows = cats.map((cat) => {
    const monthly = months.map((m) => Math.max(0, agg.summary[m]?.[cat] ?? 0));
    const total = monthly.reduce((s, v) => s + v, 0);
    const avg = months.length ? total / months.length : 0;
    const pct = grandTotal > 0 ? total / grandTotal : 0;
    return { cat, total, avg, pct, monthly };
  });

  // デフォルトは合計降順
  rows.sort((a, b) => b.total - a.total);

  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '';
  tbody.innerHTML = '';

  const trH = document.createElement('tr');
  const headers = [
    { label: 'カテゴリ', key: 'cat', cls: '' },
    { label: '合計', key: 'total', cls: 'num' },
    { label: '月平均', key: 'avg', cls: 'num' },
    { label: '構成比', key: 'pct', cls: 'num' },
    ...months.map((m, i) => ({ label: m, key: `m${i}`, cls: 'num' })),
  ];
  for (const h of headers) {
    const th = document.createElement('th');
    th.textContent = h.label;
    th.className = h.cls + ' sortable';
    th.dataset.key = h.key;
    trH.appendChild(th);
  }
  thead.appendChild(trH);

  const renderBody = (sorted) => {
    tbody.innerHTML = '';
    for (const row of sorted) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td>${escapeHtml(row.cat)}</td>` +
        `<td class="num"><strong>${fmtYen(row.total)}</strong></td>` +
        `<td class="num">${fmtYen(row.avg)}</td>` +
        `<td class="num">${fmtPct(row.pct)}</td>` +
        row.monthly.map((v) => `<td class="num">${v ? fmtYen(v) : '<span class="hint">-</span>'}</td>`).join('');
      tbody.appendChild(tr);
    }
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${headers.length}" class="hint">該当カテゴリがありません</td></tr>`;
      return;
    }
    // 合計行
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    totalRow.innerHTML =
      `<td><strong>合計</strong></td>` +
      `<td class="num"><strong>${fmtYen(grandTotal)}</strong></td>` +
      `<td class="num">${fmtYen(months.length ? grandTotal / months.length : 0)}</td>` +
      `<td class="num">100%</td>` +
      months.map((m, i) => {
        const v = sorted.reduce((s, r) => s + (r.monthly[i] ?? 0), 0);
        return `<td class="num">${fmtYen(v)}</td>`;
      }).join('');
    tbody.appendChild(totalRow);
  };

  // ソート用クリックハンドラ
  let sortKey = 'total';
  let sortDir = 'desc';
  const applySort = () => {
    const sorted = [...rows].sort((a, b) => {
      const va = sortKey === 'cat' ? a.cat : sortKey.startsWith('m')
        ? a.monthly[Number(sortKey.slice(1))]
        : a[sortKey];
      const vb = sortKey === 'cat' ? b.cat : sortKey.startsWith('m')
        ? b.monthly[Number(sortKey.slice(1))]
        : b[sortKey];
      if (typeof va === 'string') {
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      return sortDir === 'asc' ? va - vb : vb - va;
    });
    renderBody(sorted);
    for (const th of thead.querySelectorAll('th')) {
      th.classList.remove('sorted-asc', 'sorted-desc');
      if (th.dataset.key === sortKey) th.classList.add(`sorted-${sortDir}`);
    }
  };
  thead.addEventListener('click', (e) => {
    const th = e.target.closest('th[data-key]');
    if (!th) return;
    const key = th.dataset.key;
    if (key === sortKey) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = key === 'cat' ? 'asc' : 'desc'; }
    applySort();
  });

  applySort();
}

// 高額支出 TOP N
export function renderTopTxTable(table, transactions, limit = 20) {
  const tbody = table.querySelector('tbody');
  tbody.innerHTML = '';

  const expenses = transactions
    .filter((t) => (t.amount ?? 0) < 0 && !t.isExcluded)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit);

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="hint">支出がありません</td></tr>`;
    return;
  }

  for (const t of expenses) {
    const tr = document.createElement('tr');
    const subcat = t.subcategory ? ` <span class="hint">/ ${escapeHtml(t.subcategory)}</span>` : '';
    tr.innerHTML =
      `<td>${t.date}</td>` +
      `<td>${escapeHtml(t.description ?? '')}</td>` +
      `<td class="num">${fmtYen(t.amount)}</td>` +
      `<td>${escapeHtml(t.category ?? '')}${subcat}</td>` +
      `<td><span class="badge ${t.source}">${(t.source ?? '').toUpperCase()}</span></td>`;
    tbody.appendChild(tr);
  }
}

// 月別の支出/収入/収支テーブル (各月の主要支出カテゴリを表示)
export function renderMonthlyTable(table, agg) {
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML = '<tr><th>月</th><th class="num">収入</th><th class="num">支出</th><th class="num">収支</th><th>主要支出カテゴリ TOP3</th></tr>';
  tbody.innerHTML = '';

  for (const m of agg.months) {
    const data = agg.summary[m] ?? {};
    const tops = agg.categories
      .map((c) => ({ c, v: Math.max(0, data[c] ?? 0) }))
      .filter((x) => x.v > 0)
      .sort((a, b) => b.v - a.v)
      .slice(0, 3)
      .map((x) => `${escapeHtml(x.c)} <span class="hint">${fmtYen(x.v)}</span>`)
      .join(' / ');
    const balance = data._balance ?? 0;
    const balCls = balance >= 0 ? 'positive' : 'negative';
    const tr = document.createElement('tr');
    tr.innerHTML =
      `<td><strong>${m}</strong></td>` +
      `<td class="num positive">${fmtYen(data._income ?? 0)}</td>` +
      `<td class="num negative">${fmtYen(data._expense ?? 0)}</td>` +
      `<td class="num ${balCls}">${fmtYen(balance)}</td>` +
      `<td>${tops || '<span class="hint">-</span>'}</td>`;
    tbody.appendChild(tr);
  }
}
