// 集計結果からユーザー向けの「気付き / 警告 / 褒め」を生成する。
// 各アドバイスは { severity: 'alert' | 'warning' | 'info', icon, title, detail } の形。
// アラート > 警告 > 情報 の順に並べて返す。

const SEVERITY_ORDER = { alert: 0, warning: 1, info: 2 };

function fmtYen(n) {
  if (n == null || !Number.isFinite(n)) return '-';
  const v = Math.round(n);
  return (v < 0 ? '-' : '') + '¥' + Math.abs(v).toLocaleString('ja-JP');
}

function fmtPct(n, digits = 1) {
  if (!Number.isFinite(n)) return '-';
  return (n * 100).toFixed(digits) + '%';
}

function expenseOf(agg, month, category) {
  return Math.max(0, agg.summary[month]?.[category] ?? 0);
}

export function generateAdvice(agg, options = {}) {
  const advice = [];
  if (!agg || agg.months.length === 0) return advice;

  const months = agg.months;
  const latest = months[months.length - 1];
  const prev = months.length >= 2 ? months[months.length - 2] : null;
  const data = agg.summary[latest] ?? {};

  // 1) 当月赤字
  if ((data._balance ?? 0) < 0) {
    advice.push({
      severity: 'alert',
      icon: '⚠️',
      title: `${latest} は赤字です (${fmtYen(data._balance)})`,
      detail: `収入 ${fmtYen(data._income ?? 0)} に対し支出 ${fmtYen(data._expense ?? 0)}`,
    });
  }

  // 2) 期間全体で赤字
  const grandBalance = agg.totals.grandIncome - agg.totals.grandExpense;
  if (grandBalance < 0 && months.length >= 2) {
    advice.push({
      severity: 'alert',
      icon: '🚨',
      title: `期間全体で赤字 (${fmtYen(grandBalance)})`,
      detail: `収入合計 ${fmtYen(agg.totals.grandIncome)} - 支出合計 ${fmtYen(agg.totals.grandExpense)}`,
    });
  }

  // 3) 貯蓄率
  if (agg.totals.grandIncome > 0) {
    const rate = grandBalance / agg.totals.grandIncome;
    if (rate >= 0.2) {
      advice.push({
        severity: 'info',
        icon: '👍',
        title: `貯蓄率 ${fmtPct(rate)} 良いペースです`,
        detail: '理想ライン (20%以上) を達成しています',
      });
    } else if (rate >= 0 && rate < 0.1) {
      advice.push({
        severity: 'warning',
        icon: '💰',
        title: `貯蓄率が低めです (${fmtPct(rate)})`,
        detail: '理想は 20% 以上。固定費 (家賃/通信費/サブスク) の見直しが効果的',
      });
    } else if (rate < 0) {
      advice.push({
        severity: 'alert',
        icon: '💸',
        title: `貯蓄率がマイナス (${fmtPct(rate)})`,
        detail: '支出が収入を超えています。固定費と高額支出 TOP20 を確認してください',
      });
    }
  }

  // 4) 前月比 増えた / 減ったカテゴリ
  if (prev) {
    const changes = [];
    for (const cat of agg.categories) {
      const cur = expenseOf(agg, latest, cat);
      const before = expenseOf(agg, prev, cat);
      if (cur === 0 && before === 0) continue;
      const diff = cur - before;
      const pct = before > 0 ? diff / before : (cur > 0 ? Infinity : 0);
      changes.push({ cat, cur, before, diff, pct });
    }

    const minDiff = options.minMoMDiff ?? 1000; // 1000円未満の変化は無視
    const increased = changes.filter((c) => c.diff >= minDiff).sort((a, b) => b.diff - a.diff);
    for (const c of increased.slice(0, 3)) {
      const pctText = Number.isFinite(c.pct) ? ` (${(c.pct * 100).toFixed(0)}%増)` : ' (新規)';
      const sev = c.diff >= 20000 ? 'alert' : c.diff >= 5000 ? 'warning' : 'info';
      advice.push({
        severity: sev,
        icon: '📈',
        title: `${c.cat} が前月比 +${fmtYen(c.diff)}${pctText}`,
        detail: `${prev}: ${fmtYen(c.before)} → ${latest}: ${fmtYen(c.cur)}`,
      });
    }

    const decreased = changes.filter((c) => -c.diff >= minDiff).sort((a, b) => a.diff - b.diff);
    for (const c of decreased.slice(0, 2)) {
      const pctText = Number.isFinite(c.pct) ? ` (${Math.abs(c.pct * 100).toFixed(0)}%減)` : '';
      advice.push({
        severity: 'info',
        icon: '📉',
        title: `${c.cat} が前月比 ${fmtYen(c.diff)}${pctText}`,
        detail: `${prev}: ${fmtYen(c.before)} → ${latest}: ${fmtYen(c.cur)}`,
      });
    }
  }

  // 5) 3ヶ月連続で増加しているカテゴリ
  if (months.length >= 3) {
    const last3 = months.slice(-3);
    for (const cat of agg.categories) {
      const v0 = expenseOf(agg, last3[0], cat);
      const v1 = expenseOf(agg, last3[1], cat);
      const v2 = expenseOf(agg, last3[2], cat);
      const minLatest = options.minStreakAmount ?? 5000;
      if (v2 > v1 && v1 > v0 && v2 >= minLatest) {
        advice.push({
          severity: 'warning',
          icon: '🔺',
          title: `${cat} が 3ヶ月連続で増加中`,
          detail: `${last3[0]}: ${fmtYen(v0)} → ${last3[1]}: ${fmtYen(v1)} → ${last3[2]}: ${fmtYen(v2)}`,
        });
      }
    }
  }

  // 6) 今月から新規発生したカテゴリ
  if (months.length >= 2) {
    const past = months.slice(0, -1);
    for (const cat of agg.categories) {
      const inLatest = expenseOf(agg, latest, cat) > 0;
      const inPast = past.some((m) => expenseOf(agg, m, cat) > 0);
      if (inLatest && !inPast) {
        advice.push({
          severity: 'info',
          icon: '✨',
          title: `今月から新しいカテゴリ「${cat}」が発生`,
          detail: `${latest}: ${fmtYen(expenseOf(agg, latest, cat))}`,
        });
      }
    }
  }

  // 7) 月平均と当月支出の比較
  if (months.length >= 3) {
    const monthlyTotals = months.map((m) => agg.summary[m]?._expense ?? 0);
    const avg = monthlyTotals.slice(0, -1).reduce((s, v) => s + v, 0) / (monthlyTotals.length - 1);
    const cur = monthlyTotals[monthlyTotals.length - 1];
    if (avg > 0) {
      const ratio = cur / avg;
      if (ratio >= 1.2) {
        advice.push({
          severity: 'warning',
          icon: '📊',
          title: `${latest} の支出は過去平均より ${((ratio - 1) * 100).toFixed(0)}% 多い`,
          detail: `平均 ${fmtYen(avg)} に対し当月 ${fmtYen(cur)}`,
        });
      } else if (ratio <= 0.8 && cur > 0) {
        advice.push({
          severity: 'info',
          icon: '✅',
          title: `${latest} の支出は過去平均より ${((1 - ratio) * 100).toFixed(0)}% 少なめ`,
          detail: `平均 ${fmtYen(avg)} に対し当月 ${fmtYen(cur)}`,
        });
      }
    }
  }

  advice.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
  return advice;
}
