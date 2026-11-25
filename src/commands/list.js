import { UsageError } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { parsePeriod, parseTags, parseType } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, validateDataOption } from '../store.js';
import { EXPENSE, INCOME, TYPE_LABELS } from '../types.js';

export const summary = '거래 목록을 보여 줍니다.';

const USAGE = '사용법: gagyebu list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--tag <태그>] [--json] [--data <경로>]';

export function run(argv) {
  return showTransactions(argv, USAGE, (args) => {
    if (args.length > 0) {
      throw new UsageError(`예상하지 않은 인자 ${args[0]}`, USAGE);
    }
    return () => true;
  });
}

export function sortTransactions(transactions) {
  return transactions.toSorted((a, b) => {
    if (a.date === b.date) {
      return a.id - b.id;
    }
    return a.date < b.date ? -1 : 1;
  });
}

export function showTransactions(argv, usage, prepareMatch) {
  const { args, options, error } = parseOptions(argv, {
    values: ['from', 'to', 'type', 'category', 'tag', 'data'],
    flags: ['json', 'help'],
    repeatable: ['tag'],
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    console.log(usage);
    return 0;
  }
  const match = prepareMatch(args);

  const { type, category } = options;
  const { from, to } = parsePeriod(options, usage);
  if (type !== undefined) {
    parseType(type, usage);
  }
  if (category === '') {
    throw new UsageError('--category 값이 비었습니다', usage);
  }
  validateDataOption(options, usage);

  const tags = parseTags(options.tag, usage);
  const { data } = loadData(options, usage);
  const transactions = sortTransactions(data.transactions);

  const list = transactions.filter((transaction) =>
    (from === undefined || from <= transaction.date)
    && (to === undefined || transaction.date <= to)
    && (type === undefined || type === transaction.type)
    && (category === undefined || category === transaction.category)
    && tags.every((tag) => Array.isArray(transaction.tags) && transaction.tags.includes(tag))
    && match(transaction));

  if (options.json) {
    console.log(JSON.stringify(list, null, 2));
    return 0;
  }
  if (list.length === 0) {
    console.log('거래가 없습니다.');
    return 0;
  }

  const rows = [['번호', '날짜', '구분', '금액', '분류', '메모']];
  let income = 0;
  let expense = 0;
  for (const transaction of list) {
    const isIncome = transaction.type === INCOME;
    if (isIncome) {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
    const tags = Array.isArray(transaction.tags) ? transaction.tags : [];
    const memo = [transaction.memo, ...tags.map((tag) => `#${tag}`)].filter(Boolean).join(' ');
    rows.push([
      String(transaction.id), transaction.date, TYPE_LABELS[transaction.type],
      formatWon(transaction.amount), transaction.category, memo,
    ]);
  }

  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${list.length}건, ${TYPE_LABELS[INCOME]} ${formatWon(income)}, ${TYPE_LABELS[EXPENSE]} ${formatWon(expense)}`);
  return 0;
}
