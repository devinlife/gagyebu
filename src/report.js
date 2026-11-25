import { requireCategoryIndex } from './category.js';
import { DataError } from './errors.js';
import { filterTransactions, listTotals } from './transaction.js';
import { EXPENSE, RECORD_TYPES } from './types.js';

export function groupByCategory(transactions) {
  const categories = new Map();
  for (const { category, amount } of transactions) {
    const entry = categories.get(category) ?? { category, amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    categories.set(category, entry);
  }
  return categories;
}

function monthlyTotals(transactions, month, types) {
  const monthly = [];
  const entries = { expense: [], income: [] };
  for (const transaction of transactions) {
    const { date, type } = transaction;
    if (!types.includes(type) || date.slice(0, 7) !== month) {
      continue;
    }
    monthly.push(transaction);
    entries[type]?.push(transaction);
  }

  const categories = {
    expense: groupByCategory(entries.expense),
    income: groupByCategory(entries.income),
  };
  return { totals: listTotals(monthly), categories };
}

function categoryBreakdown(categories, total) {
  return [...categories.values()]
    .sort((a, b) => b.amount - a.amount || (a.category < b.category ? -1 : 1))
    .map(({ category, amount, count }) => ({ category, amount, ratio: amount / total, count }));
}

export function summarizeMonth(transactions, budgets, month) {
  const { totals, categories } = monthlyTotals(transactions, month, RECORD_TYPES);
  const { income, expense, transferCount, transfer } = totals;
  const net = income - expense;
  const expenseByCategory = categoryBreakdown(categories.expense, expense).map((entry) => {
    const { category, amount } = entry;
    const budget = Object.hasOwn(budgets, category) ? budgets[category] : null;
    const over = budget !== null && amount > budget ? amount - budget : 0;
    return { ...entry, budget, over };
  });
  const incomeByCategory = categoryBreakdown(categories.income, income);
  return { month, income, expense, net, transferCount, transfer, expenseByCategory, incomeByCategory };
}

export function summarizeYear(transactions, year) {
  const months = [];
  const total = { income: 0, expense: 0, net: 0 };
  const yearText = String(year).padStart(4, '0');
  let activeMonths = 0;

  for (let number = 1; number <= 12; number += 1) {
    const month = `${yearText}-${String(number).padStart(2, '0')}`;
    const { income, expense, net, expenseByCategory } = summarizeMonth(transactions, {}, month);
    const [topExpense] = expenseByCategory;
    const topCategory = topExpense ? { category: topExpense.category, amount: topExpense.amount } : null;
    months.push({ month, income, expense, net, topCategory });
    total.income += income;
    total.expense += expense;
    total.net += net;
    if (income !== 0 || expense !== 0) {
      activeMonths += 1;
    }
  }

  const averageExpense = activeMonths === 0 ? 0 : Math.round(total.expense / activeMonths);
  return { year, months, total, averageExpense };
}

const millisecondsPerDay = 24 * 60 * 60 * 1000;

function utcMidnight(date) {
  return new Date(`${date}T00:00:00Z`);
}

export function summarizeSpending(transactions, from, to) {
  const expenses = filterTransactions(transactions, { from, to, type: EXPENSE });
  const days = (utcMidnight(to) - utcMidnight(from)) / millisecondsPerDay + 1;
  const weekdays = ['월', '화', '수', '목', '금', '토', '일'].map((weekday) => ({
    weekday, amount: 0, count: 0,
  }));
  const expenseDates = new Set();
  let total = 0;

  for (const { date, amount } of expenses) {
    const weekday = weekdays[(utcMidnight(date).getUTCDay() + 6) % 7];
    weekday.amount += amount;
    weekday.count += 1;
    expenseDates.add(date);
    total += amount;
  }

  const categories = categoryBreakdown(groupByCategory(expenses), total).slice(0, 5);
  const top = expenses.sort((a, b) => b.amount - a.amount).slice(0, 3)
    .map(({ id, date, amount, category, memo }) => ({ id, date, amount, category, memo }));

  return {
    from, to, days, count: expenses.length, total, dailyAverage: Math.round(total / days),
    top, weekdays, daysWithoutExpense: days - expenseDates.size, categories,
  };
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
