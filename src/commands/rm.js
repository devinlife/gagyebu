import { parseIdArgument } from '../input.js';
import { parseCommand } from '../options.js';
import { loadData, writeData } from '../store.js';
import { describeTransaction, removeTransaction } from '../transaction.js';

export const name = 'rm';
export const order = 60;
export const summary = '거래 하나를 지웁니다.';

const USAGE = '사용법: gagyebu rm <번호> [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, { positional: true }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { args, options } = parsed;
  const id = parseIdArgument(args, USAGE);
  const { filePath, data } = loadData(options, USAGE);

  const { removed, transactions } = removeTransaction(data.transactions, id);
  writeData(filePath, { ...data, transactions });
  console.log(`삭제했습니다: ${describeTransaction(removed)}`);
  return 0;
}
