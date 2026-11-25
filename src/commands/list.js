import { isValidDate } from '../dates.js';
import { DataError, UsageError } from '../errors.js';
import { formatTable, formatWon } from '../format.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath } from '../store.js';

export const summary = '거래 목록을 보여 줍니다.';

const USAGE = '사용법: gagyebu list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--json] [--data <경로>]';

function tableText(value) {
  return value.replaceAll('\r', '\\r').replaceAll('\n', '\\n').replaceAll('\t', '\\t');
}

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['from', 'to', 'type', 'category', 'data'],
    flags: ['json', 'help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 0) {
    throw new UsageError(`예상하지 않은 인자 ${args[0]}`, USAGE);
  }

  const { from, to, type, category, data } = options;
  if (from !== undefined && !isValidDate(from)) {
    throw new UsageError(`--from은 YYYY-MM-DD 형식의 있는 날이어야 합니다: ${from}`, USAGE);
  }
  if (to !== undefined && !isValidDate(to)) {
    throw new UsageError(`--to는 YYYY-MM-DD 형식의 있는 날이어야 합니다: ${to}`, USAGE);
  }
  if (from !== undefined && to !== undefined && from > to) {
    throw new UsageError(`--from이 --to보다 늦습니다: ${from} > ${to}`, USAGE);
  }
  if (type !== undefined && type !== 'expense' && type !== 'income') {
    throw new UsageError(`--type은 expense 또는 income이어야 합니다: ${type}`, USAGE);
  }
  if (category === '') {
    throw new UsageError('--category 값이 비었습니다', USAGE);
  }
  if (data === '') {
    throw new UsageError('--data 값이 비었습니다', USAGE);
  }

  const filePath = resolveDataPath(data);
  const { transactions } = readData(filePath);
  if (!Array.isArray(transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (transactions가 올바르지 않습니다)`);
  }

  const list = transactions.filter((transaction) =>
    (from === undefined || from <= transaction.date)
    && (to === undefined || transaction.date <= to)
    && (type === undefined || type === transaction.type)
    && (category === undefined || category === transaction.category));
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
  let income = 0n;
  let expense = 0n;
  for (const transaction of list) {
    const isIncome = transaction.type === 'income';
    if (isIncome) {
      income += BigInt(transaction.amount);
    } else {
      expense += BigInt(transaction.amount);
    }
    rows.push([
      String(transaction.id), transaction.date, isIncome ? '수입' : '지출',
      formatWon(transaction.amount), tableText(transaction.category), tableText(transaction.memo),
    ]);
  }

  console.log(formatTable(rows, { right: [0, 3] }));
  console.log(`${list.length}건, 수입 ${formatWon(income)}, 지출 ${formatWon(expense)}`);
  return 0;
}
