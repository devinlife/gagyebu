import { findCategoryIndex } from '../category.js';
import { DataError, UsageError } from '../errors.js';
import { parseAmount, parseDate, parseTags, parseType, today } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, readError, validateDataOption, writeData } from '../store.js';
import { describeTransaction } from '../transaction.js';
import { EXPENSE } from '../types.js';

export const summary = '거래 하나를 더합니다.';

const USAGE = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['type', 'category', 'date', 'memo', 'tag', 'data'],
    flags: ['help'],
    repeatable: ['tag'],
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
  const amount = parseAmount(input, USAGE);

  const { category = '기타', memo = '' } = options;
  const type = parseType(options.type ?? EXPENSE, USAGE);
  if (category === '') {
    throw new UsageError('--category 값이 비었습니다', USAGE);
  }
  const date = options.date === undefined ? today() : parseDate(options.date, USAGE);
  validateDataOption(options, USAGE);

  const tags = parseTags(options.tag, USAGE);
  const { filePath, data } = loadData(options, USAGE);
  const { nextId: id, transactions } = data;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw readError(filePath, 'nextId 또는 transactions가 올바르지 않습니다');
  }
  if (findCategoryIndex(data.categories, type, category) === -1) {
    throw new DataError(`없는 분류입니다: ${category} (gagyebu category add로 더하세요)`);
  }
  const transaction = { id, date, type, amount, category, account: '현금', memo, tags };
  transactions.push(transaction);
  data.nextId += 1;
  writeData(filePath, data);

  console.log(`추가했습니다: ${describeTransaction(transaction)}`);
  return 0;
}
