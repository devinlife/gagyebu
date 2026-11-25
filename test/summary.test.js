import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { displayWidth } from '../src/format.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';
import { runCli, tempDir, testEnv, writeJson, transaction } from './helpers.js';

const usage = '사용법: gagyebu summary [--month YYYY-MM] [--json | --chart [--width <10~120>]] [--data <경로>]';

function fixture(t, today = '2026-02-10') {
  const directory = tempDir(t, 'gagyebu-summary-');

  const data = path.join(directory, 'data.json');
  const env = testEnv(directory, { GAGYEBU_DATA: path.join(directory, 'env.json'), GAGYEBU_TODAY: today });

  function run(...args) {
    return runCli(['summary', '--data', data, ...args], { env });
  }

  function write(transactions, budgets) {
    const schema = budgets === undefined ? { version: 1 } : { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, budgets };
    return writeJson(data, { ...schema, nextId: transactions.length + 1, transactions: transactions.map((entry, index) => transaction({ id: index + 1, ...entry })) });
  }

  return { directory, data, env, run, write };
}

function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

const february = [
  { date: '2026-03-01', type: 'expense', category: '식비', amount: 70000 },
  { date: '2026-02-01', type: 'expense', category: '식비', amount: 10000 },
  { date: '2026-02-07', type: 'expense', category: '교통', amount: 12500 },
  { date: '2026-02-10', type: 'income', category: '급여', amount: 3000000 },
  { date: '2026-01-31', type: 'income', category: '급여', amount: 1000000 },
  { date: '2026-02-20', type: 'expense', category: '식비', amount: 10000 },
  { date: '2026-02-28', type: 'expense', category: '식비', amount: 20000 },
  { date: '2026-02-28', type: 'transfer', category: '식비', amount: 80000 },
];

test('지정한 달의 수입과 지출 및 분류별 집계를 JSON으로 출력한다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write([...february, {
    date: '2028-02-29', type: 'income', category: '급여', amount: 10,
  }]);

  assert.deepEqual(JSON.parse(output(run('--month', '2026-02', '--json'))), {
    month: '2026-02',
    income: 3000000,
    expense: 52500,
    net: 2947500,
    expenseByCategory: [
      { category: '식비', amount: 40000, ratio: 40000 / 52500, count: 3, budget: null, over: 0 },
      { category: '교통', amount: 12500, ratio: 12500 / 52500, count: 1, budget: null, over: 0 },
    ],
    incomeByCategory: [{ category: '급여', amount: 3000000, ratio: 1, count: 1 }],
  });
  assert.equal(JSON.parse(output(run('--month', '2028-02', '--json'))).income, 10);
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('기본 달은 오늘을 따르고 요약 표의 한글 폭과 숫자 칸을 맞춘다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write(february);

  assert.equal(output(run()), [
    '2026년 2월',
    '수입 3,000,000원',
    '지출 52,500원',
    '차액 2,947,500원',
    '',
    '지출 분류      금액   비율  건수',
    '식비       40,000원  76.2%     3',
    '교통       12,500원  23.8%     1',
    '',
    '수입 분류         금액    비율  건수',
    '급여       3,000,000원  100.0%     1',
    '',
  ].join('\n'));
  assert.equal(output(run('--month', '2026-11')), '2026년 11월 거래가 없습니다.\n');
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('같은 금액은 분류 이름 순으로 정렬하고 표에서만 비율을 반올림한다', (t) => {
  const { run, write } = fixture(t);
  write(['식비', '교통', '문화'].map((category) => ({
    date: '2026-02-10', type: 'expense', category, amount: 1,
  })));

  const tableRows = output(run()).trimEnd().split('\n').slice(6);
  assert.deepEqual(tableRows.map((line) => line.split(/\s+/)), [
    ['교통', '1원', '33.3%', '1'],
    ['문화', '1원', '33.3%', '1'],
    ['식비', '1원', '33.3%', '1'],
  ]);
  const json = JSON.parse(output(run('--json')));
  assert.deepEqual(json.expenseByCategory, ['교통', '문화', '식비'].map((category) => ({
    category, amount: 1, ratio: 1 / 3, count: 1, budget: null, over: 0,
  })));

  for (const [smaller, larger, expected] of [
    [1, 15, ['93.8%', '6.3%']],
    [23, 1977, ['98.9%', '1.2%']],
  ]) {
    write([
      { date: '2026-02-10', type: 'expense', category: '교통', amount: smaller },
      { date: '2026-02-10', type: 'expense', category: '식비', amount: larger },
    ]);
    const rows = output(run()).trimEnd().split('\n').slice(6);
    assert.deepEqual(rows.map((line) => line.split(/\s+/)[2]), expected);
  }
});

test('지출 차트는 한글과 영문 분류의 막대를 맞추고 금액과 비율을 출력한다', (t) => {
  const { env, run, write } = fixture(t);
  write(february.map((entry) => entry.category === '교통' ? { ...entry, category: 'Cafe' } : entry), { 식비: 35000 });
  delete env.NO_COLOR;
  const chart = output(run('--chart'));
  assert.equal(chart, [
    '2026년 2월',
    '수입 3,000,000원',
    '지출 52,500원',
    '차액 2,947,500원',
    '',
    `식비  ${'█'.repeat(40)}  40,000원  76.2%`,
    `Cafe  ${'█'.repeat(12)}▌${' '.repeat(29)}12,500원  23.8%`,
    '예산 초과: 식비',
    '',
    '수입 분류         금액    비율  건수',
    '급여       3,000,000원  100.0%     1',
    '',
  ].join('\n'));
  const chartRows = chart.split('\n').slice(5, 7);
  assert.deepEqual(chartRows.map((line) => displayWidth(line.slice(0, line.indexOf('█')))), [6, 6]);
  assert.equal(output(run('--chart', '--width', '20')).split('\n')[5], `식비  ${'█'.repeat(20)}  40,000원  76.2%`);
  env.NO_COLOR = '1';
  assert.equal(output(run('--chart')), chart);
  assert.doesNotMatch(chart, /\x1b/);
});

test('지출 예산과 초과액을 표와 JSON에 표시하고 반올림 전 금액으로 초과를 판정한다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write([
    ...february,
    { date: '2026-02-10', type: 'expense', category: '문화', amount: 20000 },
    { date: '2026-02-10', type: 'expense', category: '의료', amount: 10001 },
    { date: '2026-02-10', type: 'expense', category: '생활', amount: 3000 },
  ], { 식비: 35000, 문화: 20000, 교통: 25000, 의료: 10000, 통신: 10000 });

  assert.equal(output(run()), [
    '2026년 2월',
    '수입 3,000,000원',
    '지출 85,501원',
    '차액 2,914,499원',
    '',
    '지출 분류      금액   비율  건수',
    '식비       40,000원  46.8%     3  예산 35,000원 (114.3%) 초과 5,000원',
    '문화       20,000원  23.4%     1  예산 20,000원 (100.0%)',
    '교통       12,500원  14.6%     1  예산 25,000원 (50.0%)',
    '의료       10,001원  11.7%     1  예산 10,000원 (100.0%) 초과 1원',
    '생활        3,000원   3.5%     1',
    '예산 초과: 식비, 의료',
    '',
    '수입 분류         금액    비율  건수',
    '급여       3,000,000원  100.0%     1',
    '',
  ].join('\n'));
  assert.deepEqual(JSON.parse(output(run('--json'))), {
    month: '2026-02', income: 3000000, expense: 85501, net: 2914499,
    expenseByCategory: [
      { category: '식비', amount: 40000, ratio: 40000 / 85501, count: 3, budget: 35000, over: 5000 },
      { category: '문화', amount: 20000, ratio: 20000 / 85501, count: 1, budget: 20000, over: 0 },
      { category: '교통', amount: 12500, ratio: 12500 / 85501, count: 1, budget: 25000, over: 0 },
      { category: '의료', amount: 10001, ratio: 10001 / 85501, count: 1, budget: 10000, over: 1 },
      { category: '생활', amount: 3000, ratio: 3000 / 85501, count: 1, budget: null, over: 0 },
    ],
    incomeByCategory: [{ category: '급여', amount: 3000000, ratio: 1, count: 1 }],
  });
  assert.equal(readFileSync(data, 'utf8'), original);

  write(february, { 식비: 40000, 교통: 25000 });
  const withinBudget = output(run());
  assert.match(withinBudget, /예산 40,000원 \(100\.0%\)/);
  assert.doesNotMatch(withinBudget, /초과/);
});

test('거래가 있는 구분의 표만 출력하고 음수 차액에 쉼표를 넣는다', (t) => {
  const { run, write } = fixture(t);
  write([{ date: '2026-02-10', type: 'expense', category: '식비', amount: 1000 }]);
  const expense = output(run());
  assert.match(expense, /^2026년 2월\n수입 0원\n지출 1,000원\n차액 -1,000원\n\n지출 분류/);
  assert.doesNotMatch(expense, /수입 분류/);

  write([{ date: '2026-02-10', type: 'income', category: '급여', amount: 1000 }]);
  const income = output(run());
  assert.match(income, /^2026년 2월\n수입 1,000원\n지출 0원\n차액 1,000원\n\n수입 분류/);
  assert.doesNotMatch(income, /지출 분류/);
});

test('집계할 거래가 없는 달은 안내 한 줄 또는 빈 JSON 집계를 출력한다', (t) => {
  const { directory, run, write } = fixture(t);
  const empty = {
    month: '2026-02', income: 0, expense: 0, net: 0, expenseByCategory: [], incomeByCategory: [],
  };
  const assertEmpty = () => {
    assert.equal(output(run()), '2026년 2월 거래가 없습니다.\n');
    assert.deepEqual(JSON.parse(output(run('--json'))), empty);
  };

  assertEmpty();
  assert.deepEqual(readdirSync(directory), []);
  write([{ date: '2026-03-01', type: 'expense', category: '식비', amount: 1000 }]);
  assertEmpty();
  write([{ date: '2026-02-10', type: 'transfer', category: '식비', amount: 1000 }]);
  assertEmpty();
});

test('사용법 오류를 데이터 읽기 전에 종료 코드 2로 출력한다', (t) => {
  const { data, run } = fixture(t);
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  for (const [args, message] of [
    ...['2026-2', '2026-13', '2026-00', '26-02', '2026-02-01', ''].map((month) => [
      ['--month', month], `--month는 YYYY-MM 형식의 달이어야 합니다: ${month}`,
    ]),
    [['--month'], '--month 값이 없습니다'],
    [['--chart', '--width'], '--width 값이 없습니다'],
    [['--chart', '--json'], '--chart와 --json은 함께 쓸 수 없습니다'],
    [['--width', '20'], '--width는 --chart와 함께 써야 합니다'],
    ...['9', '121', '10.5'].map((width) => [
      ['--chart', '--width', width], `--width는 10에서 120 사이의 정수여야 합니다: ${width}`,
    ]),
    [['--data'], '--data 값이 없습니다'],
    [['--nope'], '알 수 없는 옵션 --nope'],
    [['extra'], '예상하지 않은 인자 extra'],
    [['--data', ''], '--data 값이 비었습니다'],
    [['--json=1'], '--json은 값을 받지 않습니다'],
    [['--help=1'], '--help은 값을 받지 않습니다'],
    [['--help', '--nope'], '알 수 없는 옵션 --nope'],
  ]) {
    const { status, stdout, stderr } = run(...args);
    const invocation = JSON.stringify(args);
    assert.equal(status, 2, invocation);
    assert.equal(stdout, '', invocation);
    assert.equal(stderr, `오류: ${message}\n${usage}\n`, invocation);
  }
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('명시한 달이 없으면 잘못된 오늘 설정을 사용법 오류로 돌려준다', (t) => {
  const { data, run } = fixture(t, '2026-02-30');
  writeFileSync(data, '{깨진 JSON');
  const { status, stdout, stderr } = run();
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: GAGYEBU_TODAY는 YYYY-MM-DD 형식의 있는 날이어야 합니다: 2026-02-30\n사용법은 gagyebu help를 보세요.\n');
});

test('깨진 JSON과 배열이 아닌 거래 목록은 종료 코드 1로 보고한다', (t) => {
  const { data, run } = fixture(t);
  for (const [original, reason] of [
    ['{깨진 JSON', 'JSON 형식이 잘못되었습니다'],
    [JSON.stringify({ version: 1, nextId: 1, transactions: {} }), 'transactions가 올바르지 않습니다'],
  ]) {
    writeFileSync(data, original);
    const { status, stdout, stderr } = run('--month', '2026-02');
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (${reason})\n`);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('summary --help는 사용법 한 줄을 출력한다', (t) => {
  const { data, run } = fixture(t);
  writeFileSync(data, '{깨진 JSON');
  assert.equal(output(run('--help')), `${usage}\n`);
  assert.equal(output(run('--help', 'extra', '--month', '2026-13')), `${usage}\n`);
});

test('금액이 0인 거래는 분류 집계 전에 데이터 오류를 보고한다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write([{ date: '2026-02-10', type: 'expense', category: '통신', amount: 0 }]);
  const { status, stdout, stderr } = run('--month', '2026-02');
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (거래 #1: amount가 양의 정수가 아닙니다)\n`);
  assert.equal(readFileSync(data, 'utf8'), original);
});
