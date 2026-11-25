import { DEFAULT_ACCOUNT, requireAccount } from './account.js';
import { DEFAULT_CATEGORY, requireCategoryIndex } from './category.js';
import { DataError, UsageError } from './errors.js';
import { formatTag, formatWon, withParticle } from './format.js';
import { MISSING_AMOUNT, parseAmount, parseCategory, parseDate, parseImportType, parseNonemptyOption, parseTags, parseType, today } from './input.js';
import { readError } from './store.js';
import { EXPENSE, INCOME, TRANSFER, TYPE_LABELS } from './types.js';

const categoryHint = ' (gagyebu category add로 더하세요)';

export function categoryText({ type, account, toAccount, category }) {
  return type === TRANSFER ? `${account}→${toAccount}` : category;
}

export function describeTransaction(transaction) {
  const { id, date, type, amount, memo, tags } = transaction;
  const category = categoryText(transaction);
  const label = TYPE_LABELS[type];
  const description = memo ? `${category} ${memo}` : category;
  const tagText = Array.isArray(tags) && tags.length > 0 ? ` ${tags.map(formatTag).join(' ')}` : '';
  return `#${id} ${date} ${label} ${formatWon(amount)} ${description}${tagText}`;
}

export function describeAddedTransaction(transaction) {
  return `추가했습니다: ${describeTransaction(transaction)}`;
}

function withField(field, ErrorType, read) {
  try {
    return read();
  } catch (error) {
    if (error instanceof ErrorType) {
      error.field = field;
    }
    throw error;
  }
}

export function parseEntryOptions({ type, category, account, memo = '', tags }, usage, beforeTags) {
  const parsedType = withField('type', UsageError, () => parseType(type ?? EXPENSE, usage));
  const parsedCategory = withField('category', UsageError, () => parseCategory(category ?? DEFAULT_CATEGORY, usage));
  const parsedAccount = withField('account', UsageError, () => parseNonemptyOption(account ?? DEFAULT_ACCOUNT, 'account', usage));
  beforeTags?.();
  const parsedTags = withField('tags', UsageError, () => parseTags(tags ?? [], usage));
  return { type: parsedType, category: parsedCategory, account: parsedAccount, memo, tags: parsedTags };
}

export function parseTransactionFields({ amount, date, ...entry }, usage) {
  const parsedAmount = withField('amount', UsageError, () => {
    if (amount === undefined) {
      throw new UsageError(MISSING_AMOUNT, usage);
    }
    return parseAmount(amount, usage);
  });

  let parsedDate;
  const parsedEntry = parseEntryOptions(entry, usage, () => {
    parsedDate = date === undefined ? today() : withField('date', UsageError, () => parseDate(date, usage));
  });
  return { ...parsedEntry, amount: parsedAmount, date: parsedDate };
}

export function buildTransaction(data, { date, type, amount, category, account = DEFAULT_ACCOUNT, memo, tags }, filePath) {
  const id = requireNextId(data, filePath);
  requireEntryReferences(data, { type, category, account });
  return { id, date, type, amount, category, account, memo, tags };
}

export function appendTransaction(data, transaction) {
  data.transactions.push(transaction);
  data.nextId += 1;
}

export function requireEntryReferences(data, { type, category, account }) {
  withField('category', DataError, () => requireCategoryIndex(data.categories, type, category, categoryHint));
  withField('account', DataError, () => requireAccount(data.accounts, account));
}

export function requireDistinctAccounts(from, to, usage) {
  if (from === to) {
    throw new UsageError('보내는 계좌와 받는 계좌는 달라야 합니다', usage);
  }
}

export function buildTransfer(data, { date, amount, from, to, memo }, filePath) {
  const id = requireNextId(data, filePath);
  requireAccount(data.accounts, from);
  requireAccount(data.accounts, to);
  return { id, date, type: TRANSFER, amount, category: '', account: from, toAccount: to, memo, tags: [] };
}

function requireNextId({ nextId: id }, filePath) {
  if (!Number.isSafeInteger(id) || id < 1) {
    throw readError(filePath, 'nextId 또는 transactions가 올바르지 않습니다');
  }
  return id;
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
      const type = parseImportType(fields.type);
      const category = fields.category || DEFAULT_CATEGORY;
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

export function applyChanges(data, id, changes, usage) {
  const transaction = data.transactions[findTransactionIndex(data.transactions, id)];
  const updated = { ...transaction, ...changes };
  if (transaction.type === TRANSFER) {
    if (updated.type !== TRANSFER) {
      throw new UsageError('이체의 구분은 바꿀 수 없습니다', usage);
    }
    if (changes.category !== undefined) {
      throw new UsageError('이체에는 분류가 없습니다', usage);
    }
  } else {
    if (changes.toAccount !== undefined) {
      throw new UsageError('--to는 이체에만 쓸 수 있습니다', usage);
    }
    if (changes.type !== undefined || changes.category !== undefined) {
      requireCategoryIndex(data.categories, updated.type, updated.category, categoryHint);
    }
  }
  if (changes.account !== undefined) {
    requireAccount(data.accounts, updated.account);
  }
  if (changes.toAccount !== undefined) {
    requireAccount(data.accounts, updated.toAccount);
  }
  if (updated.type === TRANSFER) {
    requireDistinctAccounts(updated.account, updated.toAccount, usage);
  }
  return updated;
}

export function filterTransactions(transactions, { from, to, type, category, account, tags = [], query } = {}) {
  const search = query?.toLowerCase();
  return transactions.filter((transaction) =>
    (from === undefined || from <= transaction.date)
    && (to === undefined || transaction.date <= to)
    && (type === undefined || type === transaction.type)
    && (category === undefined || category === transaction.category)
    && (account === undefined || account === transaction.account
      || (transaction.type === TRANSFER && account === transaction.toAccount))
    && tags.every((tag) => transaction.tags.includes(tag))
    && (search === undefined || matchesQuery(transaction, search))).sort((a, b) => {
    if (a.date === b.date) {
      return a.id - b.id;
    }
    return a.date < b.date ? -1 : 1;
  });
}

function matchesQuery({ memo, category, tags }, search) {
  return [memo, category, ...tags.map(formatTag)]
    .some((text) => text.toLowerCase().includes(search));
}

export function listTotals(transactions) {
  let income = 0;
  let expense = 0;
  let transferCount = 0;
  let transfer = 0;
  for (const { type, amount } of transactions) {
    if (type === INCOME) {
      income += amount;
    } else if (type === EXPENSE) {
      expense += amount;
    } else if (type === TRANSFER) {
      transferCount += 1;
      transfer += amount;
    }
  }
  return { count: transactions.length, income, expense, transferCount, transfer };
}
