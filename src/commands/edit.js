import { UsageError, unexpectedArgument } from '../errors.js';
import { parseAmount, parseCategory, parseDate, parseId, parseNonemptyOption, parseTags, parseType } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { applyChanges, describeTransaction, findTransactionIndex } from '../transaction.js';

export const name = 'edit';
export const order = 50;
export const summary = '거래의 값 일부를 바꿉니다.';

const USAGE = '사용법: gagyebu edit <번호> [--amount <금액>] [--type expense|income] [--category <분류>] [--account <이름>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--clear-tags] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['amount', 'type', 'category', 'account', 'date', 'memo', 'tag', 'data'],
    flags: ['help', 'clear-tags'],
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
    throw new UsageError('번호가 없습니다', USAGE);
  }
  if (args.length > 1) {
    throw unexpectedArgument(args[1], USAGE);
  }

  const id = parseId(args[0], USAGE);

  const changes = {};
  const { amount, type, category, account, date, memo } = options;
  if (amount !== undefined) {
    changes.amount = parseAmount(amount, USAGE);
  }
  if (type !== undefined) {
    changes.type = parseType(type, USAGE);
  }
  if (category !== undefined) {
    changes.category = parseCategory(category, USAGE);
  }
  if (account !== undefined) {
    changes.account = parseNonemptyOption(account, 'account', USAGE);
  }
  if (date !== undefined) {
    changes.date = parseDate(date, USAGE);
  }
  if (memo !== undefined) {
    changes.memo = memo;
  }
  if (options.tag !== undefined && options['clear-tags']) {
    throw new UsageError('--tag와 --clear-tags는 함께 쓸 수 없습니다', USAGE);
  }
  if (options.tag !== undefined || options['clear-tags']) {
    changes.tags = parseTags(options.tag, USAGE);
  }
  validateDataOption(options, USAGE);
  if (Object.keys(changes).length === 0) {
    throw new UsageError('바꿀 값이 없습니다', USAGE);
  }

  const { filePath, data } = loadData(options, USAGE);

  const transaction = applyChanges(data, id, changes);
  const index = findTransactionIndex(data.transactions, id);
  data.transactions[index] = transaction;
  writeData(filePath, data);
  console.log(`수정했습니다: ${describeTransaction(transaction)}`);
  return 0;
}
