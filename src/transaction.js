import { requireCategoryIndex } from './category.js';
import { DataError, UsageError } from './errors.js';
import { formatWon, withParticle } from './format.js';
import { parseAmount, parseDate, parseTags } from './input.js';
import { readError } from './store.js';
import { EXPENSE, INCOME, TYPE_LABELS, TYPES } from './types.js';

const categoryHint = ' (gagyebu category add로 더하세요)';

export function describeTransaction({ id, date, type, amount, category, memo, tags }) {
  const label = TYPE_LABELS[type];
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` #${tags.join(' #')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
}

export function buildTransaction(data, { date, type, amount, category, account = '현금', memo, tags }, filePath) {
  const { nextId: id } = data;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw readError(filePath, 'nextId 또는 transactions가 올바르지 않습니다');
  }
  requireCategoryIndex(data.categories, type, category, categoryHint);
  return { id, date, type, amount, category, account, memo, tags };
}

export function importTransactions(data, rows, filePath) {
  const added = [];
  const errors = [];
  let duplicates = 0;

  for (const { line, fields, error } of rows) {
    if (error !== undefined) {
      errors.push({ line, reason: error });
      continue;
    }

    try {
      const date = parseDate(fields.date, undefined, 'date는');
      const amount = parseAmount(fields.amount);
      const type = TYPES.find((value) => value === fields.type || TYPE_LABELS[value] === fields.type);
      if (type === undefined) {
        throw new UsageError(`type은 expense·income·지출·수입 중 하나여야 합니다: ${fields.type}`);
      }
      const category = fields.category || '기타';
      const account = fields.account || undefined;
      const memo = fields.memo ?? '';
      const tags = parseTags(fields.tags);
      const entry = buildTransaction({ ...data, nextId: data.nextId + added.length },
        { date, type, amount, category, account, memo, tags }, filePath);

      if (data.transactions.some((existing) =>
        existing.date === date && existing.type === type && existing.amount === amount
        && existing.category === category && existing.memo === memo)) {
        duplicates += 1;
      } else {
        added.push(entry);
      }
    } catch (error) {
      if (!(error instanceof UsageError || error instanceof DataError)) {
        throw error;
      }
      errors.push({ line, reason: error.message });
    }
  }
  return { added, duplicates, errors };
}

export function findTransactionIndex(transactions, id) {
  const index = transactions.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new DataError(`거래 #${withParticle(String(id), '이/가')} 없습니다`);
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
