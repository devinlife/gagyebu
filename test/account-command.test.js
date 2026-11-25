import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertUsageError, currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu account list|add|rm [인자] [--옵션 값]';
const usages = {
  list: '사용법: gagyebu account list [--json] [--data <경로>]',
  add: '사용법: gagyebu account add <이름> [--opening <금액>] [--data <경로>]',
  rm: '사용법: gagyebu account rm <이름> [--data <경로>]',
};

function fixture(t) {
  const env = testEnv(tempDir(t));
  return {
    file: env.GAGYEBU_DATA,
    run: (...args) => runCli(['account', ...args], { env }),
  };
}

test('계좌 도움말에서 하위 명령의 사용법을 보여 준다', (t) => {
  const { run } = fixture(t);
  assert.equal(run('--help').stdout, Object.values(usages).join('\n') + '\n');
  for (const [command, usage] of Object.entries(usages)) {
    assert.equal(run(command, '--help').stdout, usage + '\n');
  }
  assert.match(runCli(['help']).stdout, /^  account +계좌 목록을 보고 계좌를 더하거나 지웁니다\.$/m);
});

test('계좌 이름을 정리하고 시작 잔액을 저장한다', (t) => {
  const { file, run } = fixture(t);
  for (const [args, name, opening, formatted] of [
    [['  통장  '], '통장', 0, '0원'],
    [['카드', '--opening', '-50000'], '카드', -50000, '-50,000원'],
    [['신용카드', '--opening=-5만'], '신용카드', -50000, '-50,000원'],
    [['예금', '--opening', '1만'], '예금', 10000, '10,000원'],
    [['현금통', '--opening', '0'], '현금통', 0, '0원'],
  ]) {
    const { status, stdout, stderr } = run('add', ...args);
    assert.equal(status, 0, stderr);
    assert.equal(stdout, `계좌를 더했습니다: ${name} (시작 잔액 ${formatted})\n`);
    assert.deepEqual(readJson(file).accounts.at(-1), { name, opening });
  }
  const original = readFileSync(file, 'utf8');
  const duplicate = run('add', ' 통장 ');
  assert.equal(duplicate.status, 1);
  assert.equal(duplicate.stderr, '오류: 이미 있는 계좌입니다: 통장\n');
  assert.equal(readFileSync(file, 'utf8'), original);
});

test('계좌 목록을 표와 JSON으로 보여 주고 버전 1 파일은 그대로 둔다', (t) => {
  const { file, run } = fixture(t);
  const transactions = [transaction({ id: 1, account: '카드' })];
  const original = writeJson(file, { version: 1, nextId: 2, transactions });
  const table = run('list');
  assert.equal(table.status, 0, table.stderr);
  assert.deepEqual(table.stdout.trimEnd().split('\n').map((line) => line.trim().split(/ {2,}/)), [
    ['계좌', '시작 잔액', '거래'],
    ['현금', '0원', '0건'],
    ['카드', '0원', '1건'],
  ]);
  const json = run('list', '--json');
  assert.equal(json.status, 0, json.stderr);
  assert.deepEqual(JSON.parse(json.stdout), [
    { name: '현금', opening: 0, count: 0 }, { name: '카드', opening: 0, count: 1 },
  ]);
  assert.equal(readFileSync(file, 'utf8'), original);
  writeJson(file, currentData({ accounts: [{ name: '카드', opening: -50000 }] }));
  assert.match(run('list').stdout, /카드 +\-50,000원 +0건/);
});

test('쓰지 않는 계좌만 지우고 삭제 거부 시 파일을 보존한다', (t) => {
  const { file, run } = fixture(t);
  const accounts = [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }];
  const data = currentData({ accounts, nextId: 2, transactions: [transaction({ id: 1 })] });
  const original = writeJson(file, data);
  for (const [name, message] of [
    ['없음', '없는 계좌입니다: 없음'], ['현금', '1건의 거래가 쓰는 계좌입니다: 현금'],
  ]) {
    const { status, stderr } = run('rm', name);
    assert.equal(status, 1);
    assert.equal(stderr, `오류: ${message}\n`);
    assert.equal(readFileSync(file, 'utf8'), original);
  }
  const removed = run('rm', ' 카드 ');
  assert.equal(removed.status, 0, removed.stderr);
  assert.equal(removed.stdout, '계좌를 지웠습니다: 카드\n');
  assert.deepEqual(readJson(file), { ...data, accounts: [accounts[0]] });

  const single = writeJson(file, currentData());
  const last = run('rm', '현금');
  assert.equal(last.status, 1);
  assert.equal(last.stderr, '오류: 마지막 남은 계좌는 지울 수 없습니다: 현금\n');
  assert.equal(readFileSync(file, 'utf8'), single);
});

test('반복 규칙이 쓰는 계좌 삭제를 거부하고 데이터와 이력을 보존한다', (t) => {
  const { file, run } = fixture(t);
  const historyPath = `${file}.history.json`;
  const accounts = [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }];
  const recurring = [{
    id: 1, day: 31, type: 'expense', amount: 12000, category: '식비', account: '카드',
    memo: '', tags: [], start: '2026-02', end: null,
  }];
  writeJson(file, currentData({ accounts, recurring, nextRecurringId: 2 }));
  const added = run('add', '통장');
  assert.equal(added.status, 0, added.stderr);
  const original = readFileSync(file, 'utf8');
  const history = readFileSync(historyPath, 'utf8');

  const { status, stdout, stderr } = run('rm', '카드');
  assert.equal(status, 1, stderr);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: 1개 반복 규칙이 쓰는 계좌입니다: 카드\n');
  assert.equal(readFileSync(file, 'utf8'), original);
  assert.equal(readFileSync(historyPath, 'utf8'), history);
});

test('잘못된 계좌 명령은 해당 사용법을 보여 준다', (t) => {
  const { run } = fixture(t);
  assertUsageError(run(), '계좌 하위 명령이 없습니다', usage);
  assertUsageError(run('nope'), '알 수 없는 계좌 하위 명령입니다: nope', usage);
  for (const command of Object.keys(usages)) {
    const args = command === 'list' ? [] : ['계좌명'];
    assertUsageError(run(command, ...args, '남음'), '예상하지 않은 인자입니다: 남음', usages[command]);
    assertUsageError(run(command, ...args, '--oops'), '알 수 없는 옵션입니다: --oops', usages[command]);
    assertUsageError(run(command, ...args, '--data'), '--data 값이 없습니다', usages[command]);
    if (command !== 'add') {
      assertUsageError(run(command, ...args, '--opening', '100'), '알 수 없는 옵션입니다: --opening', usages[command]);
    }
  }
  for (const command of ['add', 'rm']) {
    assertUsageError(run(command), '계좌 이름이 없습니다', usages[command]);
    for (const name of ['   ', '가'.repeat(21)]) {
      assertUsageError(run(command, name), `계좌 이름은 앞뒤 공백을 뺀 1~20자여야 합니다: ${name}`, usages[command]);
    }
  }
  for (const value of ['-', '-0', '--5', '1.5', '']) {
    assertUsageError(run('add', '카드', `--opening=${value}`),
      `--opening은 금액이거나 앞에 -를 붙인 금액이어야 합니다: ${value}`, usages.add);
  }
  assertUsageError(run('add', '카드', '--opening'), '--opening 값이 없습니다', usages.add);
});

test('이체에 쓰인 양쪽 계좌의 거래를 세고 삭제를 거부한다', (t) => {
  const { file, run } = fixture(t);
  const accounts = [{ name: '현금', opening: 0 }, { name: '통장', opening: 0 }];
  const transactions = [transaction({ id: 1, type: 'transfer', category: '', toAccount: '통장' })];
  const original = writeJson(file, currentData({ accounts, nextId: 2, transactions }));
  const list = run('list', '--json');
  assert.equal(list.status, 0, list.stderr);
  assert.deepEqual(JSON.parse(list.stdout), accounts.map((account) => ({ ...account, count: 1 })));
  for (const { name } of accounts) {
    const { status, stdout, stderr } = run('rm', name);
    assert.equal(status, 1, stderr);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 1건의 거래가 쓰는 계좌입니다: ${name}\n`);
    assert.equal(readFileSync(file, 'utf8'), original);
  }
});
