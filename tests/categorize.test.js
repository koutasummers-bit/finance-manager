import { describe, expect, it } from 'vitest';
import { compileRules, categorize, categorizeAll } from '../src/core/categorize.js';
import rules from '../src/rules.default.json' assert { type: 'json' };

const compiled = compileRules(rules);

describe('categorize (default rules)', () => {
  it('classifies コンビニ as 食費', () => {
    const t = { description: 'ローソン渋谷店', amount: -580 };
    expect(categorize(t, compiled).category).toBe('食費');
    expect(categorize(t, compiled).subcategory).toBe('コンビニ');
  });

  it('classifies VPASS withdrawal as カード引落 with high priority', () => {
    const t = { description: 'VPASSヒキオトシ', amount: -45230 };
    expect(categorize(t, compiled).category).toBe('カード引落');
  });

  it('classifies salary as 収入', () => {
    const t = { description: '給与振込ｶ）ｱﾝｽﾛﾋﾟｯｸ', amount: 250000, isIncome: true };
    expect(categorize(t, compiled).category).toBe('収入');
  });

  it('classifies utility', () => {
    const t = { description: '東京電力エナジーパートナー', amount: -12000 };
    expect(categorize(t, compiled).category).toBe('光熱費');
  });

  it('falls back to default for unknown', () => {
    const t = { description: 'まったく未知のお店', amount: -1000 };
    expect(categorize(t, compiled).category).toBe('未分類');
  });
});

describe('categorizeAll', () => {
  it('annotates all transactions', () => {
    const list = [
      { description: 'ローソン', amount: -100 },
      { description: 'JR東日本', amount: -200 },
    ];
    const out = categorizeAll(list, compiled);
    expect(out[0].category).toBe('食費');
    expect(out[1].category).toBe('交通費');
  });
});
