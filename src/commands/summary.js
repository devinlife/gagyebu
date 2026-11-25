import { UsageError, unexpectedArgument } from '../errors.js';
import { formatBudgetOverage, formatPercent, formatTable, formatWon, formatYearMonth, NO_TRANSACTIONS, renderBars } from '../format.js';
import { currentMonth, parseChartOptions, parseMonth } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData } from '../store.js';
import { summarizeMonth } from '../report.js';
import { EXPENSE, INCOME, TYPE_LABELS } from '../types.js';

export const name = 'summary';
export const order = 80;
export const summary = '한 달의 수입·지출과 분류별 합계를 보여 줍니다.';

const USAGE = '사용법: gagyebu summary [--month YYYY-MM] [--json | --chart [--width <10~120>]] [--data <경로>]';

function categoryTable(heading, entries, total, showBudget = false) {
  const rows = [[heading, '금액', '비율', '건수']];
  if (showBudget) {
    rows[0].push('');
  }
  for (const { category, amount, count, budget, over } of entries) {
    const row = [category, formatWon(amount), formatPercent(amount, total), String(count)];
    if (showBudget) {
      let budgetText = budget === null ? '' : `예산 ${formatWon(budget)} (${formatPercent(amount, budget)})`;
      if (over > 0) {
        budgetText += ` ${formatBudgetOverage(over)}`;
      }
      row.push(budgetText);
    }
    rows.push(row);
  }
  return formatTable(rows, { right: [1, 2, 3] });
}

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['month', 'data', 'width'],
    flags: ['json', 'help', 'chart'],
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

  const chartWidth = parseChartOptions(options, USAGE);
  const month = parseMonth(options.month ?? currentMonth(), USAGE);
  const { data: { budgets, transactions } } = loadData(options, USAGE);

  const result = summarizeMonth(transactions, budgets, month);
  const { income, expense, net, expenseByCategory, incomeByCategory } = result;
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const title = formatYearMonth(month);
  if (expenseByCategory.length === 0 && incomeByCategory.length === 0) {
    console.log(`${title} ${NO_TRANSACTIONS}`);
    return 0;
  }

  const lines = [title, `${TYPE_LABELS[INCOME]} ${formatWon(income)}`, `${TYPE_LABELS[EXPENSE]} ${formatWon(expense)}`, `차액 ${formatWon(net)}`];
  if (expenseByCategory.length > 0) {
    if (chartWidth === null) {
      lines.push('', categoryTable(`${TYPE_LABELS[EXPENSE]} 분류`, expenseByCategory, expense, true));
    } else {
      const bars = renderBars(expenseByCategory.map(({ amount }) => amount), chartWidth);
      const rows = expenseByCategory.map(({ category, amount }, index) => [
        category, bars[index], formatWon(amount), formatPercent(amount, expense),
      ]);
      lines.push('', formatTable(rows, { right: [2, 3] }));
    }
    const overBudget = expenseByCategory.filter(({ over }) => over > 0).map(({ category }) => category);
    if (overBudget.length > 0) {
      lines.push(`예산 초과: ${overBudget.join(', ')}`);
    }
  }
  if (incomeByCategory.length > 0) {
    lines.push('', categoryTable(`${TYPE_LABELS[INCOME]} 분류`, incomeByCategory, income));
  }
  console.log(lines.join('\n'));
  return 0;
}
