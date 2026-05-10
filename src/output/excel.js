import ExcelJS from 'exceljs';

// 月次サマリ／銀行明細／カード明細／カテゴリ別集計の4シートを持つ .xlsx を作成する。

const MONEY = '#,##0;[Red]-#,##0';
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
const EXCLUDED_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
const SPLIT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF8E1' } };

function applyHeaderStyle(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'thin', color: { argb: 'FF999999' } } };
  });
}

function applyTotalStyle(row) {
  row.font = { bold: true };
  row.eachCell((cell) => {
    cell.border = { top: { style: 'thin', color: { argb: 'FF999999' } } };
  });
}

function buildSummarySheet(workbook, agg, breakdown) {
  const sheet = workbook.addWorksheet('月次サマリ');
  const incomeHeaders = agg.incomeCategories;
  const expenseHeaders = agg.categories;
  // 「銀行支出 / カード支出」を支出計の手前に挿入してソース内訳を見える化
  const headers = [
    '月',
    ...incomeHeaders,
    '収入計',
    ...expenseHeaders,
    '銀行支出',
    'カード支出',
    '支出計',
    '収支',
  ];
  const headerRow = sheet.addRow(headers);
  applyHeaderStyle(headerRow);

  // 月は新しい順で表示
  const months = [...agg.months].reverse();

  for (const month of months) {
    const data = agg.summary[month] ?? {};
    const src = breakdown?.byMonth?.[month] ?? { bank: { income: 0, expense: 0 }, card: { income: 0, expense: 0 } };
    const row = [month];
    for (const c of incomeHeaders) row.push(data[c] ?? 0);
    row.push(data._income ?? 0);
    for (const c of expenseHeaders) row.push(data[c] ?? 0);
    row.push(src.bank.expense);
    row.push(src.card.expense);
    row.push(data._expense ?? 0);
    row.push(data._balance ?? 0);
    sheet.addRow(row);
  }

  if (agg.months.length > 0) {
    const totals = ['合計'];
    for (const c of incomeHeaders) {
      totals.push(agg.months.reduce((s, m) => s + (agg.summary[m]?.[c] ?? 0), 0));
    }
    totals.push(agg.totals.grandIncome);
    for (const c of expenseHeaders) {
      totals.push(agg.months.reduce((s, m) => s + (agg.summary[m]?.[c] ?? 0), 0));
    }
    totals.push(breakdown?.totals?.bank?.expense ?? 0);
    totals.push(breakdown?.totals?.card?.expense ?? 0);
    totals.push(agg.totals.grandExpense);
    totals.push(agg.totals.grandIncome - agg.totals.grandExpense);
    const totalRow = sheet.addRow(totals);
    applyTotalStyle(totalRow);
  }

  // 数値列に書式を適用
  for (let col = 2; col <= headers.length; col++) {
    sheet.getColumn(col).numFmt = MONEY;
    sheet.getColumn(col).width = 12;
  }
  sheet.getColumn(1).width = 10;
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  return sheet;
}

function buildBankSheet(workbook, bank) {
  const sheet = workbook.addWorksheet('銀行明細');
  const headers = ['日付', '内容', '出金', '入金', '残高', 'カテゴリ', 'サブカテゴリ', '重複フラグ', 'メモ'];
  applyHeaderStyle(sheet.addRow(headers));
  for (const t of bank) {
    const row = sheet.addRow([
      t.date,
      t.description,
      t.withdrawal || null,
      t.deposit || null,
      t.balance ?? null,
      t.category ?? '',
      t.subcategory ?? '',
      t.isExcluded ? 'TRUE' : '',
      t.memo ?? '',
    ]);
    if (t.isExcluded) {
      row.eachCell((cell) => { cell.fill = EXCLUDED_FILL; });
    }
  }
  ['C', 'D', 'E'].forEach((col) => { sheet.getColumn(col).numFmt = MONEY; });
  sheet.columns = [
    { width: 12 }, { width: 36 }, { width: 12 }, { width: 12 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 10 }, { width: 20 },
  ];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function buildCardSheet(workbook, card) {
  const sheet = workbook.addWorksheet('カード明細');
  const headers = ['利用日', '利用店名', '利用金額', '支払区分', '今回回数', '今月支払金額', 'カテゴリ', 'サブカテゴリ'];
  applyHeaderStyle(sheet.addRow(headers));
  for (const t of card) {
    const row = sheet.addRow([
      t.date,
      t.description,
      t.usageAmount ?? 0,
      t.paymentKind ?? '',
      t.installments ?? '',
      t.monthlyPayment ?? 0,
      t.category ?? '',
      t.subcategory ?? '',
    ]);
    if (/分割|リボ/.test(t.paymentKind ?? '')) {
      row.eachCell((cell) => { cell.fill = SPLIT_FILL; });
    }
  }
  ['C', 'F'].forEach((col) => { sheet.getColumn(col).numFmt = MONEY; });
  sheet.columns = [
    { width: 12 }, { width: 32 }, { width: 12 }, { width: 12 },
    { width: 10 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  return sheet;
}

function buildPivotSheet(workbook, agg) {
  const sheet = workbook.addWorksheet('カテゴリ別集計');
  // 月は新しい順で並べる
  const months = [...agg.months].reverse();
  const headers = ['カテゴリ', ...months, '合計', '平均'];
  applyHeaderStyle(sheet.addRow(headers));

  const allCategories = [...agg.incomeCategories, ...agg.categories];
  for (const c of allCategories) {
    const values = months.map((m) => agg.summary[m]?.[c] ?? 0);
    const total = values.reduce((s, v) => s + v, 0);
    const avg = months.length > 0 ? Math.round(total / months.length) : 0;
    sheet.addRow([c, ...values, total, avg]);
  }

  if (months.length > 0) {
    const totalRow = ['合計'];
    for (const m of months) {
      totalRow.push(allCategories.reduce((s, c) => s + (agg.summary[m]?.[c] ?? 0), 0));
    }
    const grand = allCategories.reduce((s, c) =>
      s + months.reduce((s2, m) => s2 + (agg.summary[m]?.[c] ?? 0), 0), 0);
    totalRow.push(grand);
    totalRow.push(months.length > 0 ? Math.round(grand / months.length) : 0);
    applyTotalStyle(sheet.addRow(totalRow));
  }

  for (let col = 2; col <= headers.length; col++) {
    sheet.getColumn(col).numFmt = MONEY;
    sheet.getColumn(col).width = 12;
  }
  sheet.getColumn(1).width = 18;
  sheet.views = [{ state: 'frozen', ySplit: 1, xSplit: 1 }];
  return sheet;
}

function buildDashboardSheet(workbook, agg, chartImages) {
  const sheet = workbook.addWorksheet('ダッシュボード');
  sheet.columns = [
    { width: 3 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  // タイトル
  sheet.mergeCells('B2:I2');
  const title = sheet.getCell('B2');
  title.value = '家計簿ダッシュボード';
  title.font = { size: 18, bold: true, color: { argb: 'FF1A73E8' } };
  title.alignment = { vertical: 'middle', horizontal: 'left' };

  const period = agg.months.length > 0 ? `${agg.months[0]} 〜 ${agg.months[agg.months.length - 1]}` : '';
  sheet.mergeCells('B3:I3');
  const periodCell = sheet.getCell('B3');
  periodCell.value = `期間: ${period}（${agg.months.length}ヶ月）`;
  periodCell.font = { size: 11, color: { argb: 'FF6B7280' } };

  // KPI ボックス
  const kpiStartRow = 5;
  const kpiData = [
    ['収入合計', agg.totals.grandIncome, 'FF34A853'],
    ['支出合計', agg.totals.grandExpense, 'FFEA4335'],
    ['収支', agg.totals.grandIncome - agg.totals.grandExpense, 'FF1A73E8'],
    ['月平均支出', agg.months.length ? Math.round(agg.totals.grandExpense / agg.months.length) : 0, 'FF6B7280'],
  ];
  for (let i = 0; i < kpiData.length; i++) {
    const [label, value, color] = kpiData[i];
    const col = 2 + i * 2;
    const labelCell = sheet.getCell(kpiStartRow, col);
    labelCell.value = label;
    labelCell.font = { size: 10, color: { argb: 'FF6B7280' } };
    labelCell.alignment = { horizontal: 'left' };

    const valueCell = sheet.getCell(kpiStartRow + 1, col);
    valueCell.value = value;
    valueCell.font = { size: 16, bold: true, color: { argb: color } };
    valueCell.numFmt = MONEY;
    valueCell.alignment = { horizontal: 'left' };
    sheet.mergeCells(kpiStartRow + 1, col, kpiStartRow + 1, col + 1);
    sheet.mergeCells(kpiStartRow, col, kpiStartRow, col + 1);
  }

  // チャート画像を 2 列レイアウトで配置
  if (chartImages && chartImages.length > 0) {
    const chartTopRow = kpiStartRow + 4;
    let row = chartTopRow;
    let col = 1; // B 列起点 (0=A, 1=B)
    for (let i = 0; i < chartImages.length; i++) {
      const img = chartImages[i];
      const isWide = img.id === 'chartStacked' || img.id === 'chartLines';
      const imageId = workbook.addImage({ buffer: img.buffer, extension: 'png' });

      // 見出しセル
      const headerCell = sheet.getCell(row, col + 1);
      headerCell.value = img.title;
      headerCell.font = { size: 12, bold: true };
      if (isWide) sheet.mergeCells(row, col + 1, row, col + 8);

      // 画像
      const imgRow = row + 1;
      const width = isWide ? 720 : 380;
      const height = 280;
      sheet.addImage(imageId, {
        tl: { col: col, row: imgRow - 1 },
        ext: { width, height },
      });

      // 次の位置を計算 (画像高さ約280pxを15行で確保)
      if (isWide) {
        row += 17;
        col = 1;
      } else {
        if (col === 1) {
          col = 5; // 同じ行の右隣
        } else {
          col = 1;
          row += 17;
        }
      }
    }
  }

  return sheet;
}

export async function buildWorkbook({ bank, card, agg, chartImages = [], breakdown }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'finance-manager';
  workbook.created = new Date();

  buildDashboardSheet(workbook, agg, chartImages);
  buildSummarySheet(workbook, agg, breakdown);
  buildPivotSheet(workbook, agg);
  buildBankSheet(workbook, bank);
  buildCardSheet(workbook, card);

  return workbook;
}

export function suggestFileName(months) {
  if (!months || months.length === 0) return '家計簿.xlsx';
  const first = months[0].replace('-', '');
  const last = months[months.length - 1].replace('-', '');
  return first === last ? `家計簿_${first}.xlsx` : `家計簿_${first}_${last}.xlsx`;
}

export async function writeWorkbookBlob(workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
