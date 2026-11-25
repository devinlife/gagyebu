import { EXPENSE, TRANSFER } from './types.js';

export function countUses({ transactions, budgets = {}, recurring = [] }, field, type) {
  const counts = new Map();
  const byAccount = field === 'account';

  function increment(name, source) {
    if (!counts.has(name)) {
      counts.set(name, { transactions: 0, budgets: 0, recurring: 0 });
    }
    counts.get(name)[source]++;
  }

  for (const transaction of transactions) {
    if (byAccount || transaction.type === type) {
      increment(transaction[field], 'transactions');
    }
    if (byAccount && transaction.type === TRANSFER && transaction.toAccount !== transaction.account) {
      increment(transaction.toAccount, 'transactions');
    }
  }
  for (const rule of recurring) {
    if (byAccount || rule.type === type) {
      increment(rule[field], 'recurring');
    }
  }
  if (!byAccount && type === EXPENSE) {
    for (const name of Object.keys(budgets)) {
      increment(name, 'budgets');
    }
  }
  return counts;
}
