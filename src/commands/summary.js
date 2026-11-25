import { UsageError } from '../errors.js';
import { formatPercent, formatTable, formatWon } from '../format.js';
import { today } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData } from '../store.js';

export const summary = '한 달의 수입·지출과 분류별 합계를 보여 줍니다.';

const USAGE = '사용법: gagyebu summary [--month YYYY-MM] [--json] [--data <경로>]';
const monthPattern = /^\d{4}-(0[1-9]|1[0-2])$/;

function categoryBreakdown(categories, total) {
  return [...categories.values()]
    .filter(({ amount }) => amount !== 0)
    .sort((a, b) => b.amount - a.amount || (a.category < b.category ? -1 : 1))
    .map(({ category, amount, count }) => ({ category, amount, ratio: amount / total, count }));
}

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
        budgetText += ` 초과 ${formatWon(over)}`;
      }
      row.push(budgetText);
    }
    rows.push(row);
  }
  return formatTable(rows, { right: [1, 2, 3] });
}

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['month', 'data'],
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

  const { month = today().slice(0, 7) } = options;
  if (!monthPattern.test(month)) {
    throw new UsageError(`--month는 YYYY-MM 형식의 달이어야 합니다: ${month}`, USAGE);
  }
  const { data: { budgets, transactions } } = loadData(options, USAGE);

  const totals = { expense: 0, income: 0 };
  const categories = { expense: new Map(), income: new Map() };
  for (const { date, type, category, amount } of transactions) {
    if ((type !== 'expense' && type !== 'income') || date.slice(0, 7) !== month) {
      continue;
    }
    totals[type] += amount;
    const entries = categories[type];
    const entry = entries.get(category) ?? { category, amount: 0, count: 0 };
    entry.amount += amount;
    entry.count += 1;
    entries.set(category, entry);
  }

  const { income, expense } = totals;
  const net = income - expense;
  const expenseByCategory = categoryBreakdown(categories.expense, expense).map((entry) => {
    const { category, amount } = entry;
    const budget = Object.hasOwn(budgets, category) ? budgets[category] : null;
    const over = budget !== null && amount > budget ? amount - budget : 0;
    return { ...entry, budget, over };
  });
  const incomeByCategory = categoryBreakdown(categories.income, income);
  if (options.json) {
    const result = { month, income, expense, net, expenseByCategory, incomeByCategory };
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const title = `${month.slice(0, 4)}년 ${Number(month.slice(5))}월`;
  if (categories.expense.size === 0 && categories.income.size === 0) {
    console.log(`${title} 거래가 없습니다.`);
    return 0;
  }

  const lines = [title, `수입 ${formatWon(income)}`, `지출 ${formatWon(expense)}`, `차액 ${formatWon(net)}`];
  if (expenseByCategory.length > 0) {
    lines.push('', categoryTable('지출 분류', expenseByCategory, expense, true));
    const overBudget = expenseByCategory.filter(({ over }) => over > 0).map(({ category }) => category);
    if (overBudget.length > 0) {
      lines.push(`예산 초과: ${overBudget.join(', ')}`);
    }
  }
  if (incomeByCategory.length > 0) {
    lines.push('', categoryTable('수입 분류', incomeByCategory, income));
  }
  console.log(lines.join('\n'));
  return 0;
}
