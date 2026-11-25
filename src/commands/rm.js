import { UsageError } from '../errors.js';
import { parseId } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, writeData } from '../store.js';
import { describeTransaction, removeTransaction } from '../transaction.js';

export const name = 'rm';
export const order = 60;
export const summary = '거래 하나를 지웁니다.';

const USAGE = '사용법: gagyebu rm <번호> [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['data'],
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

  const id = parseId(args[0], USAGE);
  const { filePath, data } = loadData(options, USAGE);

  const { removed, transactions } = removeTransaction(data.transactions, id);
  writeData(filePath, { ...data, transactions });
  console.log(`삭제했습니다: ${describeTransaction(removed)}`);
  return 0;
}
