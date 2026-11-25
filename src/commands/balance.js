import { accountBalances } from '../account.js';
import { formatBalanceDate, formatTable, formatWon } from '../format.js';
import { parseDateOrToday } from '../input.js';
import { parseCommand } from '../options.js';
import { loadData } from '../store.js';

export const name = 'balance';
export const order = 77;
export const summary = '계좌별 잔액과 합계를 보여 줍니다.';

const USAGE = '사용법: gagyebu balance [--date YYYY-MM-DD] [--json] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['date'],
    flags: ['json'],
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { options } = parsed;

  const date = parseDateOrToday(options.date, USAGE);
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
