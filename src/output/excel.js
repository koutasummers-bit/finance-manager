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

function buildSummarySheet(workbook, agg) {
  const sheet = workbook.addWorksheet('月次サマリ');
  const incomeHeaders = agg.incomeCategories;
  const expenseHeaders = agg.categories;
  const headers = ['月', ...incomeHeaders, '収入計', ...expenseHeaders, '支出計', '収支'];
  const headerRow = sheet.addRow(headers);
  applyHeaderStyle(headerRow);

  const monthSums = {};
  for (const month of agg.months) {
    const data = agg.summary[month] ?? {};
    const row = [month];
    for (const c of incomeHeaders) row.push(data[c] ?? 0);
    row.push(data._income ?? 0);
    for (const c of expenseHeaders) row.push(data[c] ?? 0);
    row.push(data._expense ?? 0);
    row.push(data._balance ?? 0);
    sheet.addRow(row);
    monthSums[month] = data;
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
  const months = agg.months;
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

export async function buildWorkbook({ bank, card, agg }) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'finance-manager';
  workbook.created = new Date();

  buildSummarySheet(workbook, agg);
  buildBankSheet(workbook, bank);
  buildCardSheet(workbook, card);
  buildPivotSheet(workbook, agg);

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
