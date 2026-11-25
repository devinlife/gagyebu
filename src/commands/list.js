import { DataError, UsageError } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { parseDate } from '../input.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath } from '../store.js';
import { parseTags } from '../transaction.js';

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

  const { type, category, data } = options;
  const from = options.from === undefined ? undefined : parseDate(options.from);
  if (from === null) {
    throw new UsageError(`--from은 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ${options.from}`, usage);
  }
  const to = options.to === undefined ? undefined : parseDate(options.to);
  if (to === null) {
    throw new UsageError(`--to는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ${options.to}`, usage);
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new UsageError(`--from이 --to보다 늦습니다: ${from} > ${to}`, usage);
  }
  if (type !== undefined && type !== 'expense' && type !== 'income') {
    throw new UsageError(`--type은 expense 또는 income이어야 합니다: ${type}`, usage);
  }
  if (category === '') {
    throw new UsageError('--category 값이 비었습니다', usage);
  }
  if (data === '') {
    throw new UsageError('--data 값이 비었습니다', usage);
  }

  const tags = parseTags(options.tag, usage);
  const filePath = resolveDataPath(data);
  const { transactions } = readData(filePath);
  if (!Array.isArray(transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (transactions가 올바르지 않습니다)`);
  }

  const list = transactions.filter((transaction) =>
    (from === undefined || from <= transaction.date)
    && (to === undefined || transaction.date <= to)
    && (type === undefined || type === transaction.type)
    && (category === undefined || category === transaction.category)
    && tags.every((tag) => Array.isArray(transaction.tags) && transaction.tags.includes(tag))
    && match(transaction));
  list.sort((a, b) => {
    if (a.date === b.date) {
      return a.id - b.id;
    }
    return a.date < b.date ? -1 : 1;
  });

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
    const isIncome = transaction.type === 'income';
    if (isIncome) {
      income += transaction.amount;
    } else {
      expense += transaction.amount;
    }
    const tags = Array.isArray(transaction.tags) ? transaction.tags : [];
    const memo = [transaction.memo, ...tags.map((tag) => `#${tag}`)].filter(Boolean).join(' ');
    rows.push([
      String(transaction.id), transaction.date, isIncome ? '수입' : '지출',
      formatWon(transaction.amount), transaction.category, memo,
    ]);
  }

  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${list.length}건, 수입 ${formatWon(income)}, 지출 ${formatWon(expense)}`);
  return 0;
}
