import { DataError, UsageError } from '../errors.js';
import { parseAmount, parseDate } from '../input.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath, writeData } from '../store.js';
import { describeTransaction, parseId } from '../transaction.js';

export const summary = '거래의 값 일부를 바꿉니다.';

const USAGE = '사용법: gagyebu edit <번호> [--amount <금액>] [--type expense|income] [--category <분류>] [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['amount', 'type', 'category', 'date', 'memo', 'data'],
    flags: ['help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length === 0) {
    throw new UsageError('번호가 없습니다', USAGE);
  }
  if (args.length > 1) {
    throw new UsageError(`예상하지 않은 인자 ${args[1]}`, USAGE);
  }

  const id = parseId(args[0]);
  if (id === null) {
    throw new UsageError(`번호는 양의 정수여야 합니다: ${args[0]}`, USAGE);
  }

  const changes = {};
  const { amount, type, category, date, memo } = options;
  if (amount !== undefined) {
    changes.amount = parseAmount(amount);
    if (changes.amount === null) {
      throw new UsageError(`금액은 양의 정수여야 합니다: ${amount}`, USAGE);
    }
  }
  if (type !== undefined) {
    if (type !== 'expense' && type !== 'income') {
      throw new UsageError(`--type은 expense 또는 income이어야 합니다: ${type}`, USAGE);
    }
    changes.type = type;
  }
  if (category !== undefined) {
    if (category === '') {
      throw new UsageError('--category 값이 비었습니다', USAGE);
    }
    changes.category = category;
  }
  if (date !== undefined) {
    changes.date = parseDate(date);
    if (changes.date === null) {
      throw new UsageError(`날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ${date}`, USAGE);
    }
  }
  if (memo !== undefined) {
    changes.memo = memo;
  }
  if (options.data === '') {
    throw new UsageError('--data 값이 비었습니다', USAGE);
  }
  if (Object.keys(changes).length === 0) {
    throw new UsageError('바꿀 값이 없습니다', USAGE);
  }

  const filePath = resolveDataPath(options.data);
  const data = readData(filePath);
  if (!Array.isArray(data.transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (transactions가 올바르지 않습니다)`);
  }

  const transaction = data.transactions.find((entry) => entry.id === id);
  if (!transaction) {
    throw new DataError(`거래 #${id}가 없습니다`);
  }

  Object.assign(transaction, changes);
  writeData(filePath, data);
  console.log(`수정했습니다: ${describeTransaction(transaction)}`);
  return 0;
}
