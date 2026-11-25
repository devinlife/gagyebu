import { formatPercent, formatTable, formatWon } from '../format.js';
import { parsePeriod } from '../input.js';
import { parseCommand } from '../options.js';
import { summarizeSpending } from '../report.js';
import { loadData } from '../store.js';

export const name = 'stats';
export const order = 82;
export const summary = '기간의 지출 통계를 보여 줍니다.';

const USAGE = '사용법: gagyebu stats [--from <날짜>] [--to <날짜>] [--json] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['from', 'to'],
    flags: ['json'],
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { options } = parsed;

  const { from, to } = parsePeriod(options, USAGE, { closed: true });
  const { data: { transactions } } = loadData(options, USAGE);
  const result = summarizeSpending(transactions, from, to);
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return 0;
  }

  const period = `${from} ~ ${to}`;
  const { days, count, total, dailyAverage, top, weekdays, daysWithoutExpense, categories } = result;
  if (count === 0) {
    console.log(`${period} 동안 지출이 없습니다.`);
    return 0;
  }

  const topRows = [['날짜', '금액', '분류', '메모'], ...top.map(({ date, amount, category, memo }) => [
    date, formatWon(amount), category, memo,
  ])];
  const weekdayRows = [['요일', '금액', '건수'], ...weekdays.map(({ weekday, amount, count }) => [
    weekday, formatWon(amount), String(count),
  ])];
  const categoryRows = [['분류', '금액', '비율'], ...categories.map(({ category, amount }) => [
    category, formatWon(amount), formatPercent(amount, total),
  ])];
  console.log([
    `${period} (${days}일)`,
    `지출 ${count}건, 합계 ${formatWon(total)}, 일평균 ${formatWon(dailyAverage)}`,
    `지출 없는 날 ${daysWithoutExpense}일`,
    '',
    '가장 큰 지출',
    formatTable(topRows, { right: [1] }),
    '',
    '요일별',
    formatTable(weekdayRows, { right: [1, 2] }),
    '',
    '분류 상위',
    formatTable(categoryRows, { right: [1, 2] }),
  ].join('\n'));
  return 0;
}
