import { requireCategoryIndex } from './category.js';
import { DataError } from './errors.js';
import { EXPENSE, TYPES } from './types.js';

function monthlyTotals(transactions, month, types) {
  const totals = { expense: 0, income: 0 };
  const categories = { expense: new Map(), income: new Map() };
  for (const { date, type, category, amount } of transactions) {
    if (!types.includes(type) || date.slice(0, 7) !== month) {
      continue;
    }
    totals[type] += amount;
    const entries = categories[type];
    const entry = entries.get(category) ?? { category, amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    entries.set(category, entry);
  }

  return { totals, categories };
}

function categoryBreakdown(categories, total) {
  return [...categories.values()]
    .sort((a, b) => b.amount - a.amount || (a.category < b.category ? -1 : 1))
    .map(({ category, amount, count }) => ({ category, amount, ratio: amount / total, count }));
}

export function summarizeMonth(transactions, budgets, month) {
  const { totals, categories } = monthlyTotals(transactions, month, TYPES);
  const { income, expense } = totals;
  const net = income - expense;
  const expenseByCategory = categoryBreakdown(categories.expense, expense).map((entry) => {
    const { category, amount } = entry;
    const budget = Object.hasOwn(budgets, category) ? budgets[category] : null;
    const over = budget !== null && amount > budget ? amount - budget : 0;
    return { ...entry, budget, over };
  });
  const incomeByCategory = categoryBreakdown(categories.income, income);
  return { month, income, expense, net, expenseByCategory, incomeByCategory };
}

export function budgetUsage(transactions, budgets, month) {
  const { categories } = monthlyTotals(transactions, month, [EXPENSE]);
  const entries = Object.entries(budgets).map(([category, budget]) => {
    const spent = categories.expense.get(category)?.amount ?? 0;
    return { category, budget, spent, ratio: spent / budget, remaining: budget - spent };
  });
  entries.sort((a, b) => b.ratio - a.ratio || (a.category < b.category ? -1 : 1));
  return entries;
}

export function setBudget({ categories, budgets }, category, amount) {
  requireCategoryIndex(categories, EXPENSE, category);
  return { ...budgets, [category]: amount };
}

export function removeBudget(budgets, category) {
  if (!Object.hasOwn(budgets, category)) {
    throw new DataError(`예산이 없는 분류입니다: ${category}`);
  }
  const updated = { ...budgets };
  delete updated[category];
  return updated;
}
