import { requireCategoryIndex } from './category.js';
import { DataError } from './errors.js';
import { formatWon } from './format.js';
import { readError } from './store.js';
import { EXPENSE, INCOME, TYPE_LABELS } from './types.js';

const categoryHint = ' (gagyebu category add로 더하세요)';

export function describeTransaction({ id, date, type, amount, category, memo, tags }) {
  const label = TYPE_LABELS[type];
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` #${tags.join(' #')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
}

export function buildTransaction(data, { date, type, amount, category, memo, tags }, filePath) {
  const { nextId: id } = data;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw readError(filePath, 'nextId 또는 transactions가 올바르지 않습니다');
  }
  requireCategoryIndex(data.categories, type, category, categoryHint);
  return { id, date, type, amount, category, account: '현금', memo, tags };
}

export function findTransactionIndex(transactions, id) {
  const index = transactions.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new DataError(`거래 #${id}가 없습니다`);
  }
  return index;
}

export function removeTransaction(transactions, id) {
  const index = findTransactionIndex(transactions, id);
  return { removed: transactions[index], transactions: transactions.toSpliced(index, 1) };
}

export function applyChanges(data, id, changes) {
  const transaction = data.transactions[findTransactionIndex(data.transactions, id)];
  const updated = { ...transaction, ...changes };
  if (changes.type !== undefined || changes.category !== undefined) {
    requireCategoryIndex(data.categories, updated.type, updated.category, categoryHint);
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
    && tags.every((tag) => transaction.tags.includes(tag))
    && (search === undefined || matchesQuery(transaction, search))).sort((a, b) => {
    if (a.date === b.date) {
      return a.id - b.id;
    }
    return a.date < b.date ? -1 : 1;
  });
}

function matchesQuery({ memo, category, tags }, search) {
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
