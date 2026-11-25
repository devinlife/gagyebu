import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertUsageError, currentData, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu balance [--date YYYY-MM-DD] [--json] [--data <경로>]';

function fixture(t) {
  const env = testEnv(tempDir(t), { GAGYEBU_TODAY: '2026-02-10' });
  const file = env.GAGYEBU_DATA;
  const accounts = [{ name: '현금', opening: 1000 }, { name: '통장', opening: 2000 }];
  const transactions = [
    transaction({ id: 1, date: '2026-02-09', type: 'income', category: '급여', amount: 5000 }),
    transaction({ id: 2, date: '2026-02-09', account: '통장', amount: 1000 }),
    transaction({ id: 3, type: 'transfer', category: '', amount: 11000, toAccount: '통장' }),
    transaction({ id: 4, date: '2026-02-11', amount: 500 }),
  ];
  const original = writeJson(file, currentData({ accounts, transactions, nextId: 5 }));
  return { file, original, run: (...args) => runCli(['balance', ...args], { env }) };
}

function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

test('기준일까지의 거래와 시작 잔액을 합산하고 음수 잔액을 표시한다', (t) => {
  const { file, original, run } = fixture(t);
  assert.equal(output(run()), [
    '2026-02-10 기준',
    '계좌      잔액',
    '현금  -5,000원',
    '통장  12,000원',
    '합계   7,000원',
    '',
  ].join('\n'));

  for (const [args, date, cash, bank, total] of [
    [[], '2026-02-10', -5000, 12000, 7000],
    [['--date', '2026-02-09'], '2026-02-09', 6000, 1000, 7000],
    [['--date', '2026-02-10'], '2026-02-10', -5000, 12000, 7000],
    [['--date', '2026-02-11'], '2026-02-11', -5500, 12000, 6500],
  ]) {
    assert.deepEqual(JSON.parse(output(run(...args, '--json'))), {
      date,
      accounts: [
        { name: '현금', opening: 1000, balance: cash },
        { name: '통장', opening: 2000, balance: bank },
      ],
      total,
    });
  }
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('잔액 명령의 사용법 오류는 종료 코드 2로 출력한다', (t) => {
  const { file, original, run } = fixture(t);
  for (const [args, message] of [
    [['extra'], '예상하지 않은 인자입니다: extra'],
    [['--nope'], '알 수 없는 옵션입니다: --nope'],
    [['--date'], '--date 값이 없습니다'],
    [['--date', '02-30'], '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 02-30'],
    [['--data'], '--data 값이 없습니다'],
    [['--data='], '--data 값이 비었습니다'],
  ]) {
    assertUsageError(run(...args), message, usage);
  }
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('잔액 도움말은 사용법 한 줄을 출력한다', (t) => {
  const { run } = fixture(t);
  assert.equal(output(run('--help')), `${usage}\n`);
});
