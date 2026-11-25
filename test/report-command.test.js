import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { displayWidth } from '../src/format.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';
import { assertUsageError, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu report [--year YYYY] [--json | --chart [--width <10~120>]] [--data <경로>]';
const entries = [
  { amount: 4000 },
  { category: '교통', amount: 4000 },
  { type: 'income', category: '급여', amount: 10000 },
  { date: '2026-05-01', amount: 2001 },
  { date: '2026-07-01', type: 'transfer', amount: 50000 },
  { date: '2025-02-01', amount: 100000 },
];

function fixture(t, today = '2025-06-01') {
  const directory = tempDir(t, 'gagyebu-report-');
  const data = path.join(directory, 'report.json');
  const env = testEnv(directory, { GAGYEBU_TODAY: today });

  function run(...args) {
    return runCli(['report', '--data', data, ...args], { env });
  }

  function write(transactions) {
    return writeJson(data, {
      version: CURRENT_VERSION,
      categories: DEFAULT_CATEGORIES,
      budgets: {},
      nextId: transactions.length + 1,
      transactions: transactions.map((entry, index) => transaction({ id: index + 1, ...entry })),
    });
  }

  return { data, env, run, write };
}

test('연간 JSON은 이체와 다른 해를 빼고 월별 집계와 합계 및 평균을 출력한다', (t) => {
  const { data, env, run, write } = fixture(t);
  const original = write(entries);
  const { status, stdout, stderr } = run('--year', '2026', '--json');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  const result = JSON.parse(stdout);
  const february = {
    month: '2026-02', income: 10000, expense: 8000, net: 2000, topCategory: { category: '교통', amount: 4000 },
  };
  const may = {
    month: '2026-05', income: 0, expense: 2001, net: -2001, topCategory: { category: '식비', amount: 2001 },
  };
  const empty = { income: 0, expense: 0, net: 0, topCategory: null };
  assert.deepEqual(result, {
    year: 2026,
    months: [
      { month: '2026-01', ...empty }, february, { month: '2026-03', ...empty },
      { month: '2026-04', ...empty }, may, { month: '2026-06', ...empty },
      { month: '2026-07', ...empty }, { month: '2026-08', ...empty }, { month: '2026-09', ...empty },
      { month: '2026-10', ...empty }, { month: '2026-11', ...empty }, { month: '2026-12', ...empty },
    ],
    total: { income: 10000, expense: 10001, net: -1 },
    averageExpense: 5001,
  });

  for (const { month, ...monthlyReport } of result.months) {
    const monthly = runCli(['summary', '--data', data, '--month', month, '--json'], { env });
    assert.equal(monthly.status, 0, monthly.stderr);
    assert.equal(monthly.stderr, '');
    const { income, expense, net, expenseByCategory } = JSON.parse(monthly.stdout);
    const [top] = expenseByCategory;
    const topCategory = top ? { category: top.category, amount: top.amount } : null;
    assert.deepEqual(monthlyReport, { income, expense, net, topCategory }, month);
  }
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('연간 표는 금액 칸을 맞추고 합계와 월평균 지출을 출력한다', (t) => {
  const { run, write } = fixture(t);
  write(entries);
  const { status, stdout, stderr } = run('--year', '2026');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(stdout, [
    '2026년',
    '월        수입      지출      차액  지출 1위',
    '1월        0원       0원       0원  -',
    '2월   10,000원   8,000원   2,000원  교통 4,000원',
    '3월        0원       0원       0원  -',
    '4월        0원       0원       0원  -',
    '5월        0원   2,001원  -2,001원  식비 2,001원',
    '6월        0원       0원       0원  -',
    '7월        0원       0원       0원  -',
    '8월        0원       0원       0원  -',
    '9월        0원       0원       0원  -',
    '10월       0원       0원       0원  -',
    '11월       0원       0원       0원  -',
    '12월       0원       0원       0원  -',
    '합계  10,000원  10,001원      -1원',
    '월평균 지출 5,001원',
    '',
  ].join('\n'));
});

test('빈 해도 열두 달, 합계, 월평균 지출을 0원으로 보여 준다', (t) => {
  const { run } = fixture(t);
  const { status, stdout, stderr } = run('--year', '2026');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.deepEqual(stdout.trimEnd().split('\n').map((line) => line.split(/\s+/)), [
    ['2026년'],
    ['월', '수입', '지출', '차액', '지출', '1위'],
    ...Array.from({ length: 12 }, (_, index) => [`${index + 1}월`, '0원', '0원', '0원', '-']),
    ['합계', '0원', '0원', '0원'],
    ['월평균', '지출', '0원'],
  ]);
});

test('연간 차트는 열두 달을 표시하고 지출 0원은 빈 막대, 소액은 최소 조각으로 표시한다', (t) => {
  const { run, write } = fixture(t);
  write([
    { date: '2026-01-01', amount: 1 },
    { date: '2026-10-01', amount: 8000 },
    { date: '2026-10-01', type: 'income', category: '급여', amount: 20000 },
  ]);

  const { status, stdout, stderr } = run('--year', '2026', '--chart');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  const lines = stdout.split('\n');
  assert.equal(lines[0], '2026년');
  const months = lines.slice(1, -2);
  assert.deepEqual(months.map((line) => line.split(' ')[0]),
    Array.from({ length: 12 }, (_, index) => `${index + 1}월`));
  assert.equal(months[0], `1월   ▏${' '.repeat(45)}1원`);
  assert.equal(months[1], `2월${' '.repeat(49)}0원`);
  assert.equal(months[9], `10월  ${'█'.repeat(40)}  8,000원`);
  assert.equal(displayWidth(months[0].slice(0, months[0].indexOf('▏'))), 6);
  assert.equal(displayWidth(months[9].slice(0, months[9].indexOf('█'))), 6);
  assert.deepEqual(lines.slice(-2), ['월평균 지출 4,001원', '']);
  assert.doesNotMatch(stdout, /\x1b| $/m);

  const narrow = run('--year', '2026', '--chart', '--width', '10');
  assert.equal(narrow.status, 0, narrow.stderr);
  assert.equal(narrow.stdout.split('\n')[10], `10월  ${'█'.repeat(10)}  8,000원`);
});

test('연도를 생략하면 기준일의 연도를 사용한다', (t) => {
  const { run, write } = fixture(t);
  write(entries);
  const { status, stdout, stderr } = run('--json');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  const { year, total } = JSON.parse(stdout);
  assert.equal(year, 2025);
  assert.deepEqual(total, { income: 0, expense: 100000, net: -100000 });
});

test('연간 보고 사용법 오류는 데이터 파일을 읽기 전에 종료 코드 2로 출력한다', (t) => {
  const { data, run } = fixture(t);
  writeFileSync(data, '{깨진 JSON');
  for (const [args, message] of [
    [['--year', '26'], '--year는 YYYY 형식의 연도여야 합니다: 26'],
    [['--month', '2026-01'], '알 수 없는 옵션입니다: --month'],
    [['extra'], '예상하지 않은 인자입니다: extra'],
    [['--year'], '--year 값이 없습니다'],
    [['--data'], '--data 값이 없습니다'],
    [['--chart', '--width'], '--width 값이 없습니다'],
    [['--chart', '--json'], '--chart와 --json은 함께 쓸 수 없습니다'],
    [['--width', '20'], '--width는 --chart와 함께 써야 합니다'],
    ...['9', '121', '10.5'].map((width) => [
      ['--chart', '--width', width], `--width는 10에서 120 사이의 정수여야 합니다: ${width}`,
    ]),
  ]) {
    assertUsageError(run(...args), message, usage);
  }
});

test('연간 보고가 데이터 파일을 읽을 수 없으면 종료 코드 1을 돌려준다', (t) => {
  const { data, run } = fixture(t);
  writeFileSync(data, '{깨진 JSON');
  const { status, stdout, stderr } = run('--year', '2026');
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (JSON 형식이 잘못되었습니다)\n`);
});

test('연간 보고의 사용법과 전체 도움말에 명령을 표시한다', (t) => {
  const { data, env, run } = fixture(t);
  writeFileSync(data, '{깨진 JSON');
  const { status, stdout, stderr } = run('--help');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
  const help = runCli(['help'], { env });
  assert.equal(help.status, 0, help.stderr);
  assert.match(help.stdout, /^  report +한 해의 달별 수입·지출을 보여 줍니다\.$/m);
});
