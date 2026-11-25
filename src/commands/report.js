import { UsageError } from '../errors.js';
import { formatMonthName, formatTable, formatWon } from '../format.js';
import { parseYear, today } from '../input.js';
import { parseOptions } from '../options.js';
import { summarizeYear } from '../report.js';
import { loadData } from '../store.js';
import { EXPENSE, INCOME, TYPE_LABELS } from '../types.js';

export const name = 'report';
export const order = 85;
export const summary = '한 해의 달별 수입·지출을 보여 줍니다.';

const USAGE = '사용법: gagyebu report [--year YYYY] [--json] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['year', 'data'],
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
    throw new UsageError(`예상하지 않은 인자 ${args[0]}`, USAGE);
  }

  const yearText = options.year ?? today().slice(0, 4);
  const year = parseYear(yearText, USAGE);
  const { data: { transactions } } = loadData(options, USAGE);
  const result = summarizeYear(transactions, year);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const { months, total, averageExpense } = result;
  const rows = [['월', TYPE_LABELS[INCOME], TYPE_LABELS[EXPENSE], '차액', `${TYPE_LABELS[EXPENSE]} 1위`]];
  for (const { month, income, expense, net, topCategory } of months) {
    const top = topCategory ? `${topCategory.category} ${formatWon(topCategory.amount)}` : '-';
    rows.push([formatMonthName(month), formatWon(income), formatWon(expense), formatWon(net), top]);
  }
  rows.push(['합계', formatWon(total.income), formatWon(total.expense), formatWon(total.net), '']);
  console.log([
    `${yearText}년`,
    formatTable(rows, { right: [1, 2, 3] }),
    `월평균 지출 ${formatWon(averageExpense)}`,
  ].join('\n'));
  return 0;
}
