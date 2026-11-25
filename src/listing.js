import { formatTable, formatTag, formatTransferTotal, formatWon, NO_TRANSACTIONS } from './format.js';
import { parseCategory, parseNonemptyOption, parsePeriod, parseTags, parseType } from './input.js';
import { parseCommand } from './options.js';
import { validateDataOption } from './store.js';
import { categoryText, listTotals } from './transaction.js';
import { EXPENSE, INCOME, TYPE_LABELS } from './types.js';

export function parseListingArgs(argv, usage, parseQuery) {
  const parsed = parseCommand(argv, {
    values: ['from', 'to', 'type', 'category', 'account', 'tag'],
    flags: ['json'],
    repeatable: ['tag'],
    positional: true,
  }, usage);
  if (parsed.help) {
    return parsed;
  }
  const { args, options } = parsed;
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
    console.log(NO_TRANSACTIONS);
    return;
  }

  const rows = [['번호', '날짜', '구분', '금액', '분류', '계좌', '메모']];
  for (const transaction of list) {
    const memo = [transaction.memo, ...transaction.tags.map(formatTag)].filter(Boolean).join(' ');
    rows.push([
      String(transaction.id), transaction.date, TYPE_LABELS[transaction.type],
      formatWon(transaction.amount), categoryText(transaction), transaction.account, memo,
    ]);
  }

  const { count, income, expense, transferCount, transfer } = listTotals(list);
  const transferText = transferCount > 0 ? `, ${formatTransferTotal(transferCount, transfer)}` : '';
  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${count}건, ${TYPE_LABELS[INCOME]} ${formatWon(income)}, ${TYPE_LABELS[EXPENSE]} ${formatWon(expense)}${transferText}`);
}
