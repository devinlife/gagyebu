import { accountBalances } from '../account.js';
import { UsageError, unexpectedArgument } from '../errors.js';
import { formatBalanceDate, formatTable, formatWon } from '../format.js';
import { parseDate, today } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, validateDataOption } from '../store.js';

export const name = 'balance';
export const order = 77;
export const summary = '계좌별 잔액과 합계를 보여 줍니다.';

const USAGE = '사용법: gagyebu balance [--date YYYY-MM-DD] [--json] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['date', 'data'],
    flags: ['json', 'help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 0) {
    throw unexpectedArgument(args[0], USAGE);
  }

  const date = options.date === undefined ? today() : parseDate(options.date, USAGE);
  validateDataOption(options, USAGE);
  const { data } = loadData(options, USAGE);
  const balances = accountBalances(data, date);
  if (options.json) {
    console.log(JSON.stringify(balances, null, 2));
    return 0;
  }

  const rows = [['계좌', '잔액']];
  for (const { name, balance } of balances.accounts) {
    rows.push([name, formatWon(balance)]);
  }
  rows.push(['합계', formatWon(balances.total)]);
  console.log(formatBalanceDate(date));
  console.log(formatTable(rows, { right: [1] }));
  return 0;
}
