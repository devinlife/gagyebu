import { findCategoryIndex } from './category.js';
import { DataError } from './errors.js';
import { formatWon } from './format.js';
import { readError } from './store.js';
import { EXPENSE, INCOME, TYPE_LABELS } from './types.js';

export function describeTransaction({ id, date, type, amount, category, memo, tags }) {
  const label = TYPE_LABELS[type];
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` #${tags.join(' #')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
}

function requireCategory(categories, type, category) {
  if (findCategoryIndex(categories, type, category) === -1) {
    throw new DataError(`없는 분류입니다: ${category} (gagyebu category add로 더하세요)`);
  }
}

export function buildTransaction(data, { date, type, amount, category, memo, tags }, filePath) {
  const { nextId: id } = data;
  if (!Number.isSafeInteger(id) || id < 1) {
    const reason = 'nextId 또는 transactions가 올바르지 않습니다';
    throw filePath === undefined ? new DataError(reason) : readError(filePath, reason);
  }
  requireCategory(data.categories, type, category);
  return { id, date, type, amount, category, account: '현금', memo, tags };
}

export function applyChanges(data, id, changes) {
  const transaction = data.transactions.find((entry) => entry.id === id);
  if (!transaction) {
    throw new DataError(`거래 #${id}가 없습니다`);
  }

  const updated = { ...transaction, ...changes };
  if (changes.type !== undefined || changes.category !== undefined) {
    requireCategory(data.categories, updated.type, updated.category);
  }
  return updated;
}

export function filterTransactions(transactions, { from, to, type, category, tags = [], query } = {}) {
  const search = query?.toLowerCase();
  return transactions.filter((transaction) =>
    (from === undefined || from <= transaction.date)
    && (to === undefined || transaction.date <= to)
    && (type === undefined || type === transaction.type)
    && (category === undefined || category === transaction.category)
    && tags.every((tag) => transaction.tags?.includes(tag))
    && (search === undefined || matchesQuery(transaction, search))).sort((a, b) => {
    if (a.date === b.date) {
      return a.id - b.id;
    }
    return a.date < b.date ? -1 : 1;
  });
}

function matchesQuery({ memo, category, tags = [] }, search) {
  return [memo, category, ...tags.map((tag) => `#${tag}`)]
    .some((text) => text.toLowerCase().includes(search));
}

export function listTotals(transactions) {
  let income = 0;
  let expense = 0;
  for (const { type, amount } of transactions) {
    if (type === INCOME) {
      income += amount;
    } else if (type === EXPENSE) {
      expense += amount;
    }
  }
  return { count: transactions.length, income, expense };
}
