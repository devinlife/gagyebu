import { parseName } from '../category.js';
import { UsageError, unexpectedArgument } from '../errors.js';
import { formatPercent, formatTable, formatWon } from '../format.js';
import { parseAmount, today } from '../input.js';
import { parseOptions } from '../options.js';
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
  const [command, ...operands] = argv;
  if (command === '--help') {
    const { args, error } = parseOptions(operands, {});
    if (error || args.length > 0) {
      throw error ? new UsageError(error, USAGE) : unexpectedArgument(args[0], USAGE);
    }
    console.log(Object.values(USAGES).join('\n'));
    return 0;
  }
  if (command === undefined) {
    throw new UsageError('예산 하위 명령이 없습니다', USAGE);
  }
  if (!Object.hasOwn(USAGES, command)) {
    throw new UsageError(`알 수 없는 예산 하위 명령입니다: ${command}`, USAGE);
  }

  const usage = USAGES[command];
  const { args, options, error } = parseOptions(operands, {
    values: ['data'],
    flags: command === 'list' ? ['help', 'json'] : ['help'],
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    console.log(usage);
    return 0;
  }
  validateDataOption(options, usage);

  if (command === 'list') {
    if (args.length > 0) {
      throw unexpectedArgument(args[0], usage);
    }
    const month = today().slice(0, 7);
    const { data } = loadData(options, usage);
    listBudgets(data, month, options);
    return 0;
  }

  if (command === 'set') {
    const name = parseName(args.slice(0, 1), usage);
    if (args.length === 1) {
      throw new UsageError('금액이 없습니다', usage);
    }
    if (args.length > 2) {
      throw unexpectedArgument(args[2], usage);
    }
    const amount = parseAmount(args[1], usage);
    const { filePath, data } = loadData(options, usage);
    const budgets = setBudget(data, name, amount);
    writeData(filePath, { ...data, budgets });
    console.log(`설정했습니다: ${name} 월 ${formatWon(amount)}`);
    return 0;
  }

  const name = parseName(args, usage);
  const { filePath, data } = loadData(options, usage);
  const budgets = removeBudget(data.budgets, name);
  writeData(filePath, { ...data, budgets });
  console.log(`예산을 지웠습니다: ${name}`);
  return 0;
}
