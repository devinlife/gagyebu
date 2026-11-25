import { requireAmountArgument } from '../input.js';
import { parseCommand } from '../options.js';
import { loadData, writeData } from '../store.js';
import { appendTransaction, buildTransaction, describeAddedTransaction, parseTransactionFields } from '../transaction.js';

export const name = 'add';
export const order = 20;
export const summary = '거래 하나를 더합니다.';

const USAGE = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--account <이름>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['type', 'category', 'account', 'date', 'memo', 'tag'],
    repeatable: ['tag'],
    positional: true,
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { args, options } = parsed;
  const amount = requireAmountArgument(args, USAGE);
  const fields = parseTransactionFields({ amount, ...options, tags: options.tag }, USAGE);

  const { filePath, data } = loadData(options, USAGE);
  const transaction = buildTransaction(data, fields);
  appendTransaction(data, transaction);
  writeData(filePath, data);

  console.log(describeAddedTransaction(transaction));
  return 0;
}
