import { formatMonthName, formatTable, formatWon, renderBars } from '../format.js';
import { currentYear, parseChartOptions, parseYear } from '../input.js';
import { parseCommand } from '../options.js';
import { summarizeYear } from '../report.js';
import { loadData } from '../store.js';
import { EXPENSE, INCOME, TYPE_LABELS } from '../types.js';

export const name = 'report';
export const order = 85;
export const summary = '한 해의 달별 수입·지출을 보여 줍니다.';

const USAGE = '사용법: gagyebu report [--year YYYY] [--json | --chart [--width <10~120>]] [--data <경로>]';

function yearTable(months, total) {
  const rows = [['월', TYPE_LABELS[INCOME], TYPE_LABELS[EXPENSE], '차액', `${TYPE_LABELS[EXPENSE]} 1위`]];
  for (const { month, income, expense, net, topCategory } of months) {
    const top = topCategory ? `${topCategory.category} ${formatWon(topCategory.amount)}` : '-';
    rows.push([formatMonthName(month), formatWon(income), formatWon(expense), formatWon(net), top]);
  }
  rows.push(['합계', formatWon(total.income), formatWon(total.expense), formatWon(total.net), '']);
  return formatTable(rows, { right: [1, 2, 3] });
}

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['year', 'width'],
    flags: ['json', 'chart'],
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { options } = parsed;

  const chartWidth = parseChartOptions(options, USAGE);
  const yearText = options.year ?? currentYear();
  const year = parseYear(yearText, USAGE);
  const { data: { transactions } } = loadData(options, USAGE);
  const result = summarizeYear(transactions, year);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const { months, total, averageExpense } = result;
  let table;
  if (chartWidth === null) {
    table = yearTable(months, total);
  } else {
    const bars = renderBars(months.map(({ expense }) => expense), chartWidth);
    const rows = months.map(({ month, expense }, index) => [
      formatMonthName(month), bars[index], formatWon(expense),
    ]);
    table = formatTable(rows, { right: [2] });
  }
  console.log([
    `${yearText}년`,
    table,
    `월평균 지출 ${formatWon(averageExpense)}`,
  ].join('\n'));
  return 0;
}
