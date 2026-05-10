// カテゴリ別クロス集計テーブルと「高額支出 TOP N」テーブル、月別収支テーブルを描画するモジュール。
// 集計は aggregate.js の結果 (summary[month][category]) を直接使う。

const PALETTE = [
  '#1a73e8', '#34a853', '#fbbc04', '#ea4335', '#9334e6',
  '#0d9488', '#f97316', '#ec4899', '#0891b2', '#65a30d',
  '#6b7280', '#7c3aed', '#dc2626', '#059669', '#d97706',
];

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

// 値・最大値・色からデータバー付きセルの HTML を作る。値が 0 は通常表示。
function barCell(value, max, color) {
  if (!value || value <= 0) return `<td class="num"><span class="hint">-</span></td>`;
  const pct = max > 0 ? Math.max(2, Math.min(100, (value / max) * 100)) : 0;
  return `<td class="num has-bar">` +
    `<span class="bar-fill" style="width:${pct}%;background:${color}"></span>` +
    `<span class="bar-val">${fmtYen(value)}</span>` +
    `</td>`;
}

// カテゴリ × 月のクロス集計テーブル。
// transactions: 該当期間のすべての取引 (drill-down 用、省略可)
export function renderCategoryTable(table, agg, kind = 'expense', transactions = []) {
  // expense: 支出カテゴリ、income: 収入カテゴリ
  const cats = kind === 'income' ? agg.incomeCategories : agg.categories;
  // 月は新しい順で表示
  const months = [...agg.months].reverse();
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

  // カテゴリの色は「総額の大きい順」で割り当てる (グラフの円グラフと一致)
  const byTotalDesc = [...rows].sort((a, b) => b.total - a.total);
  const colorMap = {};
  byTotalDesc.forEach((r, i) => { colorMap[r.cat] = PALETTE[i % PALETTE.length]; });

  // 各月の最大値 (バー長計算用)
  const colMax = months.map((_, i) => Math.max(...rows.map((r) => r.monthly[i] ?? 0), 0));
  const totalMax = Math.max(...rows.map((r) => r.total), 0);

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

  const colCount = headers.length;

  const drillForCategory = (cat) => {
    const matching = (transactions || [])
      .filter((t) => (t.category ?? '未分類') === cat && (t.amount ?? 0) !== 0)
      .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    if (matching.length === 0) {
      return `<div class="drill-content"><div class="hint">該当する取引がありません</div></div>`;
    }
    const total = matching.reduce((s, t) => s + Math.abs(t.amount ?? 0), 0);
    return `<div class="drill-content">
      <div class="drill-title">「${escapeHtml(cat)}」の取引 ${matching.length}件 / 合計 ${fmtYen(total)}</div>
      <table class="drill-table">
        <thead><tr>
          <th>日付</th><th>内容</th><th class="num">金額</th>
          <th>サブカテゴリ</th><th>ソース</th>
        </tr></thead>
        <tbody>
          ${matching.map((t) => `<tr>
            <td>${t.date}</td>
            <td>${escapeHtml(t.description ?? '')}</td>
            <td class="num">${fmtYen(t.amount)}</td>
            <td>${escapeHtml(t.subcategory ?? '')}</td>
            <td><span class="badge ${t.source}">${(t.source ?? '').toUpperCase()}</span></td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  };

  const renderBody = (sorted) => {
    tbody.innerHTML = '';
    if (sorted.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${colCount}" class="hint">該当カテゴリがありません</td></tr>`;
      return;
    }

    for (const row of sorted) {
      const color = colorMap[row.cat];
      const tr = document.createElement('tr');
      tr.className = 'cat-row';
      tr.dataset.category = row.cat;
      tr.innerHTML =
        `<td class="cat-cell">` +
          `<span class="cat-dot" style="background:${color}"></span>` +
          `<strong>${escapeHtml(row.cat)}</strong>` +
          `<span class="cat-toggle">▶</span>` +
        `</td>` +
        // 合計: 行間で正規化したバー
        barCell(row.total, totalMax, color).replace('class="num has-bar"', 'class="num has-bar emphasis"') +
        // 月平均
        `<td class="num">${fmtYen(row.avg)}</td>` +
        // 構成比: 0–100% の bar
        `<td class="num has-bar">` +
          `<span class="bar-fill" style="width:${(row.pct * 100).toFixed(1)}%;background:${color}"></span>` +
          `<span class="bar-val">${fmtPct(row.pct)}</span>` +
        `</td>` +
        // 各月: 列内の最大値で正規化
        row.monthly.map((v, i) => barCell(v, colMax[i], color)).join('');

      tr.addEventListener('click', (e) => {
        // ヘッダ行の選択などをブロックしない
        if (e.target.closest('th')) return;
        const next = tr.nextElementSibling;
        if (next?.classList.contains('drill-row')) {
          next.remove();
          tr.classList.remove('expanded');
          return;
        }
        // 開いている他のドリルを閉じる
        tbody.querySelectorAll('.drill-row').forEach((d) => d.remove());
        tbody.querySelectorAll('.cat-row.expanded').forEach((r) => r.classList.remove('expanded'));
        const drillTr = document.createElement('tr');
        drillTr.className = 'drill-row';
        drillTr.innerHTML = `<td colspan="${colCount}">${drillForCategory(row.cat)}</td>`;
        tr.after(drillTr);
        tr.classList.add('expanded');
      });

      tbody.appendChild(tr);
    }

    // 合計行
    const totalRow = document.createElement('tr');
    totalRow.className = 'total-row';
    const monthlyTotals = months.map((m, i) => sorted.reduce((s, r) => s + (r.monthly[i] ?? 0), 0));
    totalRow.innerHTML =
      `<td><strong>合計</strong></td>` +
      `<td class="num"><strong>${fmtYen(grandTotal)}</strong></td>` +
      `<td class="num">${fmtYen(months.length ? grandTotal / months.length : 0)}</td>` +
      `<td class="num">100%</td>` +
      monthlyTotals.map((v) => `<td class="num">${fmtYen(v)}</td>`).join('');
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

// 月別の収支テーブル (新しい順)。銀行/カード/合計の支出と銀行収入・収支・主要支出カテゴリを併記。
// breakdown: aggregate.js の sourceBreakdown(bank, card).byMonth
export function renderMonthlyTable(table, agg, breakdown = {}) {
  const thead = table.querySelector('thead');
  const tbody = table.querySelector('tbody');
  thead.innerHTML =
    '<tr>' +
    '<th>月</th>' +
    '<th class="num">収入 (銀行)</th>' +
    '<th class="num">銀行支出</th>' +
    '<th class="num">カード支出</th>' +
    '<th class="num">支出計</th>' +
    '<th class="num">収支</th>' +
    '<th>主要支出カテゴリ TOP3</th>' +
    '</tr>';
  tbody.innerHTML = '';

  // 月は新しい順
  const months = [...agg.months].reverse();
  for (const m of months) {
    const data = agg.summary[m] ?? {};
    const src = breakdown[m] ?? { bank: { income: 0, expense: 0 }, card: { income: 0, expense: 0 } };
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
      `<td class="num positive">${fmtYen(src.bank.income)}</td>` +
      `<td class="num">${fmtYen(src.bank.expense)}</td>` +
      `<td class="num">${fmtYen(src.card.expense)}</td>` +
      `<td class="num negative"><strong>${fmtYen(data._expense ?? 0)}</strong></td>` +
      `<td class="num ${balCls}"><strong>${fmtYen(balance)}</strong></td>` +
      `<td>${tops || '<span class="hint">-</span>'}</td>`;
    tbody.appendChild(tr);
  }

  // 合計行
  const totalRow = document.createElement('tr');
  totalRow.className = 'total-row';
  const totals = months.reduce((acc, m) => {
    const s = breakdown[m] ?? { bank: { income: 0, expense: 0 }, card: { income: 0, expense: 0 } };
    const d = agg.summary[m] ?? {};
    acc.bankIncome += s.bank.income;
    acc.bankExpense += s.bank.expense;
    acc.cardExpense += s.card.expense;
    acc.totalExpense += d._expense ?? 0;
    acc.balance += d._balance ?? 0;
    return acc;
  }, { bankIncome: 0, bankExpense: 0, cardExpense: 0, totalExpense: 0, balance: 0 });
  const balCls = totals.balance >= 0 ? 'positive' : 'negative';
  totalRow.innerHTML =
    `<td><strong>合計</strong></td>` +
    `<td class="num positive">${fmtYen(totals.bankIncome)}</td>` +
    `<td class="num">${fmtYen(totals.bankExpense)}</td>` +
    `<td class="num">${fmtYen(totals.cardExpense)}</td>` +
    `<td class="num negative"><strong>${fmtYen(totals.totalExpense)}</strong></td>` +
    `<td class="num ${balCls}"><strong>${fmtYen(totals.balance)}</strong></td>` +
    `<td></td>`;
  tbody.appendChild(totalRow);
}
