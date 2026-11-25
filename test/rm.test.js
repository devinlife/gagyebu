import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertUsageError, readJson, runCli, tempDir, testEnv, writeJson, currentData } from './helpers.js';

const usage = '사용법: gagyebu rm <번호> [--data <경로>]';

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-rm-');

  const data = path.join(directory, 'data.json');
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-03-01' });
  const original = {
    version: 1,
    nextId: 4,
    transactions: [
      {
        id: 1, date: '2026-02-27', type: 'income', amount: 40000, category: '용돈',
        account: '현금', memo: '', tags: [],
      },
      {
        id: 2, date: '2026-03-01', type: 'expense', amount: 6000, category: '식비',
        account: '카드', memo: '아침', tags: ['외식'],
      },
      {
        id: 3, date: '2026-03-01', type: 'expense', amount: 3000, category: '교통',
        account: '현금', memo: '', tags: [],
      },
    ],
  };

  function run(...args) {
    return runCli([...args], { env });
  }

  function read() {
    return readJson(data);
  }

  return { directory, data, original, run, read };
}

test('지정한 거래만 삭제하고 나머지 거래의 순서와 다음 번호를 보존한다', (t) => {
  const { directory, original, run } = fixture(t);
  const override = path.join(directory, 'override.json');
  writeJson(override, original);

  const { status, stdout, stderr } = run('rm', '2', '--data', override);

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '삭제했습니다: #2 2026-03-01 지출 6,000원 식비 아침 #외식\n');
  assert.deepEqual(readJson(override), currentData({
    nextId: original.nextId,
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }],
    transactions: [original.transactions[0], original.transactions[2]],
  }));
  assert.deepEqual(readdirSync(directory), ['override.json']);
});

test('가장 큰 번호를 지운 뒤 추가한 거래는 다음 번호를 쓴다', (t) => {
  const { data, original, run, read } = fixture(t);
  writeJson(data, original);

  const removed = run('rm', '3');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(read().nextId, 4);
  const added = run('add', '1000');
  assert.equal(added.status, 0, added.stderr);
  assert.equal(added.stdout, '추가했습니다: #4 2026-03-01 지출 1,000원 기타\n');
  const saved = read();
  assert.equal(saved.nextId, 5);
  assert.deepEqual(saved.transactions.map(({ id }) => id), [1, 2, 4]);
});

test('없는 번호를 보고하고 데이터 파일을 만들거나 바꾸지 않는다', (t) => {
  const { directory, data, original, run } = fixture(t);

  function assertMissing() {
    const { status, stdout, stderr } = run('rm', '2');
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, '오류: 거래 #2가 없습니다\n');
  }

  assertMissing();
  assert.deepEqual(readdirSync(directory), []);

  writeJson(data, original);
  const removed = run('rm', '2');
  assert.equal(removed.status, 0, removed.stderr);
  const saved = readFileSync(data, 'utf8');
  assertMissing();
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('잘못된 사용법을 데이터 읽기 전에 보고하고 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  for (const [args, message] of [
    [[], '번호가 없습니다'],
    ...['0', '-1', 'abc', '1.5', '01', '+1', '9007199254740992'].map(
      (id) => [[id], `번호는 양의 정수여야 합니다: ${id}`],
    ),
    [['1', '2'], '예상하지 않은 인자입니다: 2'],
    [['1', '--memo', 'x'], '알 수 없는 옵션입니다: --memo'],
    [['1', '--data', ''], '--data 값이 비었습니다'],
    [['1', '--data'], '--data 값이 없습니다'],
  ]) {
    assertUsageError(run('rm', ...args), message, usage);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('거래 배열이 잘못되면 데이터 오류를 보고한다', (t) => {
  const { data, original, run } = fixture(t);
  const saved = JSON.stringify({ ...original, transactions: {} });
  writeFileSync(data, saved);

  const { status, stdout, stderr } = run('rm', '1');
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (transactions가 올바르지 않습니다)\n`);
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('rm --help는 사용법을 한 줄로 출력한다', (t) => {
  const { directory, run } = fixture(t);
  const { status, stdout, stderr } = run('rm', '--help');
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
  assert.deepEqual(readdirSync(directory), []);
});
