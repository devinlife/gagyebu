import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';
import { assertUsageError, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu stats [--from <날짜>] [--to <날짜>] [--json] [--data <경로>]';
const transactions = [
  transaction({ id: 1, date: '2026-11-23', amount: 12000, memo: '점심' }),
  transaction({ id: 2, date: '2026-11-26', amount: 3000, category: '교통' }),
  transaction({ id: 3, date: '2026-11-20', type: 'transfer' }),
  transaction({ id: 4, date: '2026-11-26', type: 'income', category: '급여' }),
];

function fixture(t, entries = transactions) {
  const directory = tempDir(t);
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-11-26' });
  writeJson(env.GAGYEBU_DATA, {
    version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: entries.length + 1, transactions: entries,
  });
  return env;
}

test('stats는 이번 달 1일부터 오늘까지의 지출을 세 표로 보여 준다', (t) => {
  const env = fixture(t);
  const { status, stdout, stderr } = runCli(['stats'], { env });
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, [
    '2026-11-01 ~ 2026-11-26 (26일)',
    '지출 2건, 합계 15,000원, 일평균 577원',
    '지출 없는 날 24일',
    '',
    '가장 큰 지출',
    '날짜            금액  분류  메모',
    '2026-11-23  12,000원  식비  점심',
    '2026-11-26   3,000원  교통',
    '',
    '요일별',
    '요일      금액  건수',
    '월    12,000원     1',
    '화         0원     0',
    '수         0원     0',
    '목     3,000원     1',
    '금         0원     0',
    '토         0원     0',
    '일         0원     0',
    '',
    '분류 상위',
    '분류      금액   비율',
    '식비  12,000원  80.0%',
    '교통   3,000원  20.0%',
    '',
  ].join('\n'));
});

test('stats --json은 편의 날짜와 --data를 받아 지출 통계 객체를 출력한다', (t) => {
  const env = fixture(t);
  const file = env.GAGYEBU_DATA;
  const { status, stdout, stderr } = runCli(
    ['stats', '--from', '2/3', '--to', '어제', '--json', '--data', file],
    { env: { ...env, GAGYEBU_DATA: path.join(path.dirname(file), 'unused.json') } },
  );
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), {
    from: '2026-02-03', to: '2026-11-25', days: 296, count: 1, total: 12000, dailyAverage: 41,
    top: [{ id: 1, date: '2026-11-23', amount: 12000, category: '식비', memo: '점심' }],
    weekdays: [
      { weekday: '월', amount: 12000, count: 1 },
      ...['화', '수', '목', '금', '토', '일'].map((weekday) => ({ weekday, amount: 0, count: 0 })),
    ],
    daysWithoutExpense: 295,
    categories: [{ category: '식비', amount: 12000, ratio: 1, count: 1 }],
  });
});

test('stats는 뉴욕의 서머타임 전환을 지나도 기간 일수와 요일을 날짜대로 집계한다', (t) => {
  const env = fixture(t, [
    transaction({ id: 1, date: '2026-03-07', amount: 1000 }),
    transaction({ id: 2, date: '2026-03-08', amount: 2000 }),
    transaction({ id: 3, date: '2026-03-09', amount: 3000 }),
  ]);
  const { status, stdout, stderr } = runCli(
    ['stats', '--from', '2026-03-07', '--to', '2026-03-09', '--json'],
    { env: { ...env, TZ: 'America/New_York' } },
  );
  assert.equal(status, 0);
  assert.equal(stderr, '');
  const { days, weekdays } = JSON.parse(stdout);
  assert.equal(days, 3);
  assert.deepEqual(weekdays, [
    { weekday: '월', amount: 3000, count: 1 },
    { weekday: '화', amount: 0, count: 0 },
    { weekday: '수', amount: 0, count: 0 },
    { weekday: '목', amount: 0, count: 0 },
    { weekday: '금', amount: 0, count: 0 },
    { weekday: '토', amount: 1000, count: 1 },
    { weekday: '일', amount: 2000, count: 1 },
  ]);
});

test('stats는 빈 기간과 이체만 있는 기간에 안내 한 줄을 출력한다', (t) => {
  const env = fixture(t);
  for (const to of ['2026-10-31', '2026-11-20']) {
    const { status, stdout, stderr } = runCli(['stats', '--to', to], { env });
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.equal(stdout, `${to.slice(0, 7)}-01 ~ ${to} 동안 지출이 없습니다.\n`);
  }
});

test('stats --json은 빈 기간에도 통계 객체를 출력한다', (t) => {
  const env = fixture(t);
  const { status, stdout, stderr } = runCli(['stats', '--from', '2026-11-20', '--to', '2026-11-20', '--json'], { env });
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.deepEqual(JSON.parse(stdout), {
    from: '2026-11-20', to: '2026-11-20', days: 1, count: 0, total: 0, dailyAverage: 0,
    top: [],
    weekdays: ['월', '화', '수', '목', '금', '토', '일'].map((weekday) => ({ weekday, amount: 0, count: 0 })),
    daysWithoutExpense: 1, categories: [],
  });
});

test('stats는 잘못된 기간과 인자에 사용법 오류를 돌려준다', (t) => {
  const env = fixture(t);
  for (const [args, message] of [
    [['--from', '2026-02-30'], '--from은 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-30'],
    [['--from', '2026-11-26', '--to', '어제'], '--from이 --to보다 늦습니다: 2026-11-26 > 2026-11-25'],
    [['--nope'], '알 수 없는 옵션입니다: --nope'],
    [['남는 값'], '예상하지 않은 인자입니다: 남는 값'],
    [['--from'], '--from 값이 없습니다'],
    [['--to'], '--to 값이 없습니다'],
    [['--data'], '--data 값이 없습니다'],
  ]) {
    assertUsageError(runCli(['stats', ...args], { env }), message, usage);
  }
});

test('stats --help는 사용법 한 줄을 출력한다', () => {
  const { status, stdout, stderr } = runCli(['stats', '--help']);
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
});
