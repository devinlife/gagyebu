import { UsageError } from './errors.js';
import { formatTable, formatWon } from './format.js';
import { parseCategory, parsePeriod, parseTags, parseType } from './input.js';
import { parseOptions } from './options.js';
import { validateDataOption } from './store.js';
import { listTotals } from './transaction.js';
import { EXPENSE, INCOME, TYPE_LABELS } from './types.js';

export function parseListingArgs(argv, usage, parseQuery) {
  const { args, options, error } = parseOptions(argv, {
    values: ['from', 'to', 'type', 'category', 'tag', 'data'],
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

  const { type } = options;
  const { from, to } = parsePeriod(options, usage);
  if (type !== undefined) {
    parseType(type, usage);
  }
  const category = parseCategory(options.category, usage);
  validateDataOption(options, usage);

  const tags = parseTags(options.tag, usage);
  return { options, filters: { from, to, type, category, tags, query } };
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

  const rows = [['번호', '날짜', '구분', '금액', '분류', '메모']];
  for (const transaction of list) {
    const memo = [transaction.memo, ...transaction.tags.map((tag) => `#${tag}`)].filter(Boolean).join(' ');
    rows.push([
      String(transaction.id), transaction.date, TYPE_LABELS[transaction.type],
      formatWon(transaction.amount), transaction.category, memo,
    ]);
  }

  const { count, income, expense } = listTotals(list);
  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${count}건, ${TYPE_LABELS[INCOME]} ${formatWon(income)}, ${TYPE_LABELS[EXPENSE]} ${formatWon(expense)}`);
}
