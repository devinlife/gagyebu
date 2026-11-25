import { isValidDate, today } from '../input.js';
import { DataError, UsageError } from '../errors.js';
import { formatWon } from '../format.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath, writeData } from '../store.js';

export const summary = '거래 하나를 더합니다.';

const USAGE = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['type', 'category', 'date', 'memo', 'data'],
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
    throw new UsageError('금액이 없습니다', USAGE);
  }
  if (args.length > 1) {
    throw new UsageError(`예상하지 않은 인자 ${args[1]}`, USAGE);
  }

  const [input] = args;
  const amount = Number(input);
  if (!/^[0-9]+$/.test(input) || !Number.isSafeInteger(amount) || amount <= 0) {
    throw new UsageError(`금액은 양의 정수여야 합니다: ${input}`, USAGE);
  }

  const { type = 'expense', category = '기타', date = today({}), memo = '' } = options;
  if (type !== 'expense' && type !== 'income') {
    throw new UsageError(`--type은 expense 또는 income이어야 합니다: ${type}`, USAGE);
  }
  if (category === '') {
    throw new UsageError('--category 값이 비었습니다', USAGE);
  }
  if (!isValidDate(date)) {
    throw new UsageError(`날짜는 YYYY-MM-DD 형식의 있는 날이어야 합니다: ${date}`, USAGE);
  }
  if (options.data === '') {
    throw new UsageError('--data 값이 비었습니다', USAGE);
  }

  const filePath = resolveDataPath(options.data);
  const data = readData(filePath);
  const { nextId: id, transactions } = data;
  if (!Number.isSafeInteger(id) || id < 1 || !Array.isArray(transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (nextId 또는 transactions가 올바르지 않습니다)`);
  }
  transactions.push({ id, date, type, amount, category, account: '현금', memo, tags: [] });
  data.nextId += 1;
  writeData(filePath, data);

  const label = type === 'income' ? '수입' : '지출';
  const description = memo ? `${category} ${memo}` : category;
  console.log(`추가했습니다: #${id} ${date} ${label} ${formatWon(amount)} ${description}`);
  return 0;
}
