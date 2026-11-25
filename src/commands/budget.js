import { unexpectedArgument } from '../errors.js';
import { formatPercent, formatTable, formatWon } from '../format.js';
import { currentMonth, parseAmountArgument, parseName } from '../input.js';
import { parseSubcommand } from '../options.js';
import { budgetUsage, removeBudget, setBudget } from '../report.js';
import { loadData, validateDataOption, writeData } from '../store.js';

export const name = 'budget';
export const order = 100;
export const summary = '분류별 월 예산을 정하고 사용률을 보여 줍니다.';

const USAGE = '사용법: gagyebu budget set|list|rm [인자] [--옵션 값]';
const USAGES = {
  set: '사용법: gagyebu budget set <분류> <금액> [--data <경로>]',
  list: '사용법: gagyebu budget list [--json] [--data <경로>]',
  rm: '사용법: gagyebu budget rm <분류> [--data <경로>]',
};

function listBudgets({ budgets, transactions }, month, { json }) {
  const entries = budgetUsage(transactions, budgets, month);

  if (json) {
    console.log(JSON.stringify({ month, budgets: entries }, null, 2));
    return;
  }
  if (entries.length === 0) {
    console.log('설정한 예산이 없습니다.');
    return;
  }
  const rows = [['분류', '예산', '사용', '사용률', '남음']];
  for (const { category, budget, spent, remaining } of entries) {
    rows.push([category, formatWon(budget), formatWon(spent), formatPercent(spent, budget), formatWon(remaining)]);
  }
  console.log(formatTable(rows, { right: [1, 2, 3, 4] }));
}

export function run(argv) {
  const parsed = parseSubcommand(argv, {
    label: '예산', usage: USAGE, usages: USAGES,
  });
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { command, args, options, usage } = parsed;
  validateDataOption(options, usage);

  if (command === 'list') {
    if (args.length > 0) {
      throw unexpectedArgument(args[0], usage);
    }
    const month = currentMonth();
    const { data } = loadData(options, usage);
    listBudgets(data, month, options);
    return 0;
  }

  if (command === 'set') {
    const name = parseName(args.slice(0, 1), usage, '분류');
    const amount = parseAmountArgument(args.slice(1), usage);
    const { filePath, data } = loadData(options, usage);
    const budgets = setBudget(data, name, amount);
    writeData(filePath, { ...data, budgets });
    console.log(`설정했습니다: ${name} 월 ${formatWon(amount)}`);
    return 0;
  }

  const name = parseName(args, usage, '분류');
  const { filePath, data } = loadData(options, usage);
  const budgets = removeBudget(data.budgets, name);
  writeData(filePath, { ...data, budgets });
  console.log(`예산을 지웠습니다: ${name}`);
  return 0;
}
