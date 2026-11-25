import { UsageError } from '../errors.js';
import { parseAmount, parseCategory, parseDate, parseIdArgument, parseNonemptyOption, parseTags, parseType } from '../input.js';
import { parseCommand } from '../options.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { applyChanges, describeTransaction, findTransactionIndex } from '../transaction.js';

export const name = 'edit';
export const order = 50;
export const summary = '거래의 값 일부를 바꿉니다.';

const USAGE = '사용법: gagyebu edit <번호> [--amount <금액>] [--type expense|income] [--category <분류>] [--account <이름>] [--to <계좌>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--clear-tags] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['amount', 'type', 'category', 'account', 'to', 'date', 'memo', 'tag'],
    flags: ['clear-tags'],
    repeatable: ['tag'],
    positional: true,
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { args, options } = parsed;
  const id = parseIdArgument(args, USAGE);

  const changes = {};
  const { amount, type, category, account, to, date, memo } = options;
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
  if (to !== undefined) {
    changes.toAccount = parseNonemptyOption(to, 'to', USAGE);
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

  const transaction = applyChanges(data, id, changes, USAGE);
  const index = findTransactionIndex(data.transactions, id);
  data.transactions[index] = transaction;
  writeData(filePath, data);
  console.log(`수정했습니다: ${describeTransaction(transaction)}`);
  return 0;
}
