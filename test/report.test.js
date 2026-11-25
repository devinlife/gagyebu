import assert from 'node:assert/strict';
import { test } from 'node:test';
import { budgetUsage, summarizeMonth } from '../src/report.js';
import { transaction } from './helpers.js';

const entries = Object.freeze([
  transaction({ id: 1, amount: 3000 }),
  transaction({ id: 2, amount: 1000 }),
  transaction({ id: 3, category: '교통', amount: 4000 }),
  transaction({ id: 4, type: 'income', category: '급여', amount: 10000 }),
  transaction({ id: 5, type: 'transfer', amount: 8000 }),
  transaction({ id: 6, date: '2026-03-01', amount: 20000 }),
].map(Object.freeze));
const budgets = Object.freeze({ 식비: 2000, 교통: 2000, 문화: 5000 });

test('월 집계는 이체와 다른 달을 제외하고 분류별 비율과 예산 초과를 돌려준다', () => {
  assert.deepEqual(summarizeMonth(entries, budgets, '2026-02'), {
    month: '2026-02', income: 10000, expense: 8000, net: 2000,
    expenseByCategory: [
      { category: '교통', amount: 4000, ratio: 0.5, count: 1, budget: 2000, over: 2000 },
      { category: '식비', amount: 4000, ratio: 0.5, count: 2, budget: 2000, over: 2000 },
    ],
    incomeByCategory: [{ category: '급여', amount: 10000, ratio: 1, count: 1 }],
  });
  assert.deepEqual(summarizeMonth(entries, budgets, '2026-04'), {
    month: '2026-04', income: 0, expense: 0, net: 0, expenseByCategory: [], incomeByCategory: [],
  });
});

test('예산 사용은 등록된 분류의 월 지출을 사용률과 이름 순으로 돌려준다', () => {
  assert.deepEqual(budgetUsage(entries, budgets, '2026-02'), [
    { category: '교통', budget: 2000, spent: 4000, ratio: 2, remaining: -2000 },
    { category: '식비', budget: 2000, spent: 4000, ratio: 2, remaining: -2000 },
    { category: '문화', budget: 5000, spent: 0, ratio: 0, remaining: 5000 },
  ]);
});
