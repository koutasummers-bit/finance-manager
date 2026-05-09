import { normalizeText } from './normalize.js';

// ルールベースのカテゴリ分類。
// rules: { version, default, rules: [{ match: { field, type, value }, category, subcategory?, priority? }] }
// priority 降順 → 配列添字昇順で評価し、最初にマッチしたものを採用。

function compileRule(rule, index) {
  const { match } = rule;
  const value = match.value;
  let test;
  switch (match.type) {
    case 'contains':
      test = (target) => normalizeText(target).includes(normalizeText(value));
      break;
    case 'equals':
      test = (target) => normalizeText(target) === normalizeText(value);
      break;
    case 'regex': {
      const re = new RegExp(value, 'i');
      test = (target) => re.test(normalizeText(target));
      break;
    }
    case 'gte':
      test = (target) => Number(target) >= Number(value);
      break;
    case 'lte':
      test = (target) => Number(target) <= Number(value);
      break;
    default:
      test = () => false;
  }
  return {
    field: match.field || 'description',
    test,
    category: rule.category,
    subcategory: rule.subcategory,
    priority: rule.priority ?? 0,
    index,
  };
}

export function compileRules(ruleSet) {
  const rules = (ruleSet?.rules ?? []).map(compileRule);
  rules.sort((a, b) => (b.priority - a.priority) || (a.index - b.index));
  return {
    rules,
    fallback: ruleSet?.default ?? '未分類',
  };
}

function fieldValue(transaction, field) {
  switch (field) {
    case 'description':
      return transaction.description ?? '';
    case 'amount':
      return Math.abs(transaction.amount ?? 0);
    case 'payee':
      return transaction.description ?? '';
    case 'memo':
      return transaction.memo ?? '';
    default:
      return '';
  }
}

export function categorize(transaction, compiled) {
  for (const rule of compiled.rules) {
    if (rule.test(fieldValue(transaction, rule.field))) {
      return { category: rule.category, subcategory: rule.subcategory };
    }
  }
  return { category: compiled.fallback, subcategory: undefined };
}

export function categorizeAll(transactions, compiled) {
  return transactions.map((t) => {
    const { category, subcategory } = categorize(t, compiled);
    return { ...t, category, subcategory };
  });
}
