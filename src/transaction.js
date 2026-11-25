import { DEFAULT_ACCOUNT, requireAccount } from './account.js';
import { DEFAULT_CATEGORY, requireCategoryIndex } from './category.js';
import { DataError, UsageError } from './errors.js';
import { formatTag, formatWon, withParticle } from './format.js';
import { MISSING_AMOUNT, parseAmount, parseCategory, parseDate, parseImportType, parseNonemptyOption, parseTags, parseType, today } from './input.js';
import { EXPENSE, INCOME, TRANSFER, TYPE_LABELS } from './types.js';

const TRANSFER_HAS_NO_CATEGORY = '이체에는 분류가 없습니다';
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

export function buildTransaction(data, { date, type, amount, category, account = DEFAULT_ACCOUNT, memo, tags }) {
  requireEntryReferences(data, { type, category, account });
  return { id: data.nextId, date, type, amount, category, account, memo, tags };
}

export function appendTransaction(data, transaction) {
  appendTransactions(data, [transaction]);
}

export function appendTransactions(data, transactions) {
  for (const transaction of transactions) {
    data.transactions.push(transaction);
  }
  data.nextId += transactions.length;
}

export function requireEntryReferences(data, { type, category, account }) {
  withField('category', DataError, () => requireCategoryIndex(data.categories, type, category, categoryHint));
  withField('account', DataError, () => requireAccount(data.accounts, account));
}

function requireDistinctAccounts(from, to, usage) {
  if (from === to) {
    throw new UsageError('보내는 계좌와 받는 계좌는 달라야 합니다', usage);
  }
}

export function buildTransfer(data, { date, amount, from, to, memo, tags = [] }, usage) {
  if (from !== '' && to !== '') {
    requireDistinctAccounts(from, to, usage);
  }
  requireAccount(data.accounts, from);
  requireAccount(data.accounts, to);
  return { id: data.nextId, date, type: TRANSFER, amount, category: '', account: from, toAccount: to, memo, tags };
}

function buildImportEntry(data, fields) {
  const date = parseDate(fields.date, undefined, 'date는');
  const amount = parseAmount(fields.amount);
  const type = parseImportType(fields.type);
  const memo = fields.memo ?? '';
  if (type === TRANSFER) {
    if (fields.to_account === undefined) {
      throw new UsageError('이체에는 to_account 칸이 필요합니다');
    }
    if (fields.category) {
      throw new UsageError(TRANSFER_HAS_NO_CATEGORY);
    }
    return buildTransfer(data, {
      date, amount, from: fields.account ?? '', to: fields.to_account, memo, tags: parseTags(fields.tags),
    });
  }
  return buildTransaction(data, {
    date, type, amount, category: fields.category || DEFAULT_CATEGORY,
    account: fields.account || undefined, memo, tags: parseTags(fields.tags),
  });
}

function isDuplicate(existing, entry) {
  if (existing.date !== entry.date || existing.type !== entry.type
    || existing.amount !== entry.amount || existing.memo !== entry.memo) {
    return false;
  }
  return entry.type === TRANSFER
    ? existing.account === entry.account && existing.toAccount === entry.toAccount
    : existing.category === entry.category;
}

export function importTransactions(data, rows) {
  const added = [];
  const errors = [];
  let duplicates = 0;

  for (const { line, fields, error } of rows) {
    if (error !== undefined) {
      errors.push({ line, reason: error });
      continue;
    }

    try {
      const entry = buildImportEntry({ ...data, nextId: data.nextId + added.length }, fields);

      if (data.transactions.some((existing) => isDuplicate(existing, entry))) {
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
      throw new UsageError(TRANSFER_HAS_NO_CATEGORY, usage);
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
