import { UsageError } from '../errors.js';
import { formatWon, withParticle } from '../format.js';
import { parseAmountArgument, parseDate, parseNonemptyOption, today } from '../input.js';
import { parseCommand } from '../options.js';
import { loadData, validateDataOption, writeData } from '../store.js';
import { appendTransaction, buildTransfer, categoryText } from '../transaction.js';

export const name = 'transfer';
export const order = 25;
export const summary = '계좌 사이의 이체를 기록합니다.';

const USAGE = '사용법: gagyebu transfer <금액> --from <계좌> --to <계좌> [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['from', 'to', 'date', 'memo'],
    positional: true,
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { args, options } = parsed;
  const amount = parseAmountArgument(args, USAGE);
  for (const option of ['from', 'to']) {
    if (options[option] === undefined) {
      throw new UsageError(`${withParticle(`--${option}`, '이/가')} 없습니다`, USAGE);
    }
    parseNonemptyOption(options[option], option, USAGE);
  }
  const { from, to, memo = '' } = options;
  const date = options.date === undefined ? today() : parseDate(options.date, USAGE);
  validateDataOption(options, USAGE);

  const { filePath, data } = loadData(options, USAGE);
  const transaction = buildTransfer(data, { date, amount, from, to, memo }, USAGE);
  appendTransaction(data, transaction);
  writeData(filePath, data);

  console.log(`이체했습니다: #${transaction.id} ${date} ${categoryText(transaction)} ${formatWon(amount)}`);
  return 0;
}
