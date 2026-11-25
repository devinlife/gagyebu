import assert from 'node:assert/strict';
import { test } from 'node:test';
import { countUses } from '../src/usage.js';
import { currentData, transaction } from './helpers.js';

test('계좌와 분류의 거래, 예산, 반복 규칙 사용 수를 센다', () => {
  const data = currentData({
    transactions: [
      transaction({ account: '카드' }),
      transaction({ type: 'income' }),
      transaction({ type: 'transfer', category: '', toAccount: '카드' }),
      transaction({ type: 'transfer', category: '', account: '카드', toAccount: '카드' }),
    ],
    budgets: { 식비: 10000 },
    recurring: [{ type: 'expense', category: '식비', account: '카드' }],
  });

  const accounts = countUses(data, 'account');
  assert.deepEqual(accounts.get('카드'), { transactions: 3, budgets: 0, recurring: 1 });
  assert.deepEqual(accounts.get('현금'), { transactions: 2, budgets: 0, recurring: 0 });
  assert.deepEqual(countUses(data, 'category', 'expense'), new Map([
    ['식비', { transactions: 1, budgets: 1, recurring: 1 }],
  ]));
  assert.deepEqual(countUses(data, 'category', 'income'), new Map([
    ['식비', { transactions: 1, budgets: 0, recurring: 0 }],
  ]));
});
