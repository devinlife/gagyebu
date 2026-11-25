import { findCategoryIndex, parseName } from '../category.js';
import { DataError, UsageError } from '../errors.js';
import { formatPercent, formatTable, formatWon } from '../format.js';
import { parseAmount, today } from '../input.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath, writeData } from '../store.js';

export const summary = '분류별 월 예산을 정하고 사용률을 보여 줍니다.';

const USAGE = '사용법: gagyebu budget set|list|rm [인자] [--옵션 값]';
const USAGES = {
  set: '사용법: gagyebu budget set <분류> <금액> [--data <경로>]',
  list: '사용법: gagyebu budget list [--json] [--data <경로>]',
  rm: '사용법: gagyebu budget rm <분류> [--data <경로>]',
};

function listBudgets(filePath, { json }) {
  const month = today().slice(0, 7);
  const { budgets, transactions } = readData(filePath);
  if (!Array.isArray(transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (transactions가 올바르지 않습니다)`);
  }

  const spending = new Map();
  for (const { date, type, category, amount } of transactions) {
    if (type === 'expense' && date.slice(0, 7) === month) {
      spending.set(category, (spending.get(category) ?? 0) + amount);
    }
  }
  const entries = Object.entries(budgets).map(([category, budget]) => {
    const spent = spending.get(category) ?? 0;
    return { category, budget, spent, ratio: spent / budget, remaining: budget - spent };
  });
  entries.sort((a, b) => b.ratio - a.ratio || (a.category < b.category ? -1 : 1));

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
      throw new UsageError(error ?? `예상하지 않은 인자 ${args[0]}`, USAGE);
    }
    console.log(Object.values(USAGES).join('\n'));
    return 0;
  }
  if (command === undefined) {
    throw new UsageError('예산 하위 명령이 없습니다', USAGE);
  }
  if (!Object.hasOwn(USAGES, command)) {
    throw new UsageError(`알 수 없는 예산 하위 명령 ${command}`, USAGE);
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
  if (options.data === '') {
    throw new UsageError('--data 값이 비었습니다', usage);
  }

  const filePath = resolveDataPath(options.data);
  if (command === 'list') {
    if (args.length > 0) {
      throw new UsageError(`예상하지 않은 인자 ${args[0]}`, usage);
    }
    listBudgets(filePath, options);
    return 0;
  }

  if (command === 'set') {
    const name = parseName(args.slice(0, 1), usage);
    if (args.length === 1) {
      throw new UsageError('금액이 없습니다', usage);
    }
    if (args.length > 2) {
      throw new UsageError(`예상하지 않은 인자 ${args[2]}`, usage);
    }
    const amount = parseAmount(args[1]);
    if (amount === null) {
      throw new UsageError(`금액은 양의 정수여야 합니다: ${args[1]}`, usage);
    }
    const data = readData(filePath);
    if (findCategoryIndex(data.categories, 'expense', name) === -1) {
      throw new DataError(`없는 분류입니다: ${name}`);
    }
    data.budgets = { ...data.budgets, [name]: amount };
    writeData(filePath, data);
    console.log(`설정했습니다: ${name} 월 ${formatWon(amount)}`);
    return 0;
  }

  const name = parseName(args, usage);
  const data = readData(filePath);
  if (!Object.hasOwn(data.budgets, name)) {
    throw new DataError(`예산이 없는 분류입니다: ${name}`);
  }
  delete data.budgets[name];
  writeData(filePath, data);
  console.log(`예산을 지웠습니다: ${name}`);
  return 0;
}
