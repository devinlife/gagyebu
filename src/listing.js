import { UsageError } from './errors.js';
import { formatTable, formatWon } from './format.js';
import { parseCategory, parseNonemptyOption, parsePeriod, parseTags, parseType } from './input.js';
import { parseOptions } from './options.js';
import { validateDataOption } from './store.js';
import { categoryText, listTotals } from './transaction.js';
import { EXPENSE, INCOME, TRANSFER, TYPE_LABELS } from './types.js';

export function parseListingArgs(argv, usage, parseQuery) {
  const { args, options, error } = parseOptions(argv, {
    values: ['from', 'to', 'type', 'category', 'account', 'tag', 'data'],
    flags: ['json', 'help'],
    repeatable: ['tag'],
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    return { options };
  }
  const query = parseQuery(args);
  return { options, filters: { ...parseListingFilters(options, usage), query } };
}

export function parseListingFilters(options, usage) {
  const { type } = options;
  const { from, to } = parsePeriod(options, usage);
  if (type !== undefined) {
    parseType(type, usage);
  }
  const category = parseCategory(options.category, usage);
  const account = parseNonemptyOption(options.account, 'account', usage);
  validateDataOption(options, usage);

  const tags = parseTags(options.tag, usage);
  return { from, to, type, category, account, tags };
}

export function printTransactions(list, { json }) {
  if (json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  if (list.length === 0) {
    console.log('거래가 없습니다.');
    return;
  }

  const rows = [['번호', '날짜', '구분', '금액', '분류', '계좌', '메모']];
  for (const transaction of list) {
    const memo = [transaction.memo, ...transaction.tags.map((tag) => `#${tag}`)].filter(Boolean).join(' ');
    rows.push([
      String(transaction.id), transaction.date, TYPE_LABELS[transaction.type],
      formatWon(transaction.amount), categoryText(transaction), transaction.account, memo,
    ]);
  }

  const { count, income, expense, transferCount, transfer } = listTotals(list);
  const transferText = transferCount > 0 ? `, ${TYPE_LABELS[TRANSFER]} ${transferCount}건 ${formatWon(transfer)}` : '';
  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${count}건, ${TYPE_LABELS[INCOME]} ${formatWon(income)}, ${TYPE_LABELS[EXPENSE]} ${formatWon(expense)}${transferText}`);
}
