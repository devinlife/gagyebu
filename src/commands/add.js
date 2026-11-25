import { UsageError, unexpectedArgument } from '../errors.js';
import { parseOptions } from '../options.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { buildTransaction, describeTransaction, parseTransactionFields } from '../transaction.js';

export const name = 'add';
export const order = 20;
export const summary = '거래 하나를 더합니다.';

const USAGE = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--account <이름>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['type', 'category', 'account', 'date', 'memo', 'tag', 'data'],
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
  if (args.length > 1) {
    throw unexpectedArgument(args[1], USAGE);
  }
  const fields = parseTransactionFields({ amount: args[0], ...options, tags: options.tag }, USAGE);
  validateDataOption(options, USAGE);

  const { filePath, data } = loadData(options, USAGE);
  const transaction = buildTransaction(data, fields, filePath);
  data.transactions.push(transaction);
  data.nextId += 1;
  writeData(filePath, data);

  console.log(`추가했습니다: ${describeTransaction(transaction)}`);
  return 0;
}
