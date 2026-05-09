import { describe, expect, it } from 'vitest';
import { findCardWithdrawals, reconcile, applyExclusions } from '../src/core/dedupe.js';

describe('findCardWithdrawals', () => {
  it('detects VPASS keyword', () => {
    const bank = [
      { date: '2026-04-26', description: 'VPASSヒキオトシ', amount: -45230 },
      { date: '2026-04-03', description: 'ローソン', amount: -580 },
      { date: '2026-05-26', description: '三井住友カード', amount: -38900 },
    ];
    const found = findCardWithdrawals(bank);
    expect(found.length).toBe(2);
    expect(found[0].amount).toBe(45230);
    expect(found[1].amount).toBe(38900);
  });

  it('ignores positive (deposit) rows', () => {
    const bank = [{ date: '2026-04-01', description: 'VPASS振込', amount: 1000 }];
    expect(findCardWithdrawals(bank).length).toBe(0);
  });
});

describe('reconcile', () => {
  it('matches previous month VPass total to current month withdrawal', () => {
    const bank = [{ date: '2026-05-26', description: 'VPASSヒキオトシ', amount: -25000 }];
    const card = [
      { date: '2026-04-03', amount: -10000 },
      { date: '2026-04-15', amount: -15000 },
    ];
    const candidates = findCardWithdrawals(bank);
    const reconciled = reconcile(candidates, card);
    expect(reconciled[0].matchedMonth).toBe('2026-04');
    expect(reconciled[0].matchedTotal).toBe(25000);
    expect(reconciled[0].diff).toBe(0);
    expect(reconciled[0].autoExclude).toBe(true);
  });

  it('does not auto-exclude when amounts mismatch beyond tolerance', () => {
    const bank = [{ date: '2026-05-26', description: 'VPASSヒキオトシ', amount: -50000 }];
    const card = [{ date: '2026-04-03', amount: -10000 }];
    const reconciled = reconcile(findCardWithdrawals(bank), card);
    expect(reconciled[0].autoExclude).toBe(false);
  });
});

describe('applyExclusions', () => {
  it('marks excluded rows', () => {
    const bank = [
      { date: '2026-04-01', amount: -100 },
      { date: '2026-04-02', amount: -200 },
    ];
    const result = applyExclusions(bank, new Set([1]));
    expect(result[0].isExcluded).toBe(false);
    expect(result[1].isExcluded).toBe(true);
  });
});
