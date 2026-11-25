import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_CATEGORIES } from '../src/store.js';
import { assertUsageError, readJson, runCli, tempDir, testEnv, writeJson, currentData } from './helpers.js';

const usage = '사용법: gagyebu edit <번호> [--amount <금액>] [--type expense|income] [--category <분류>] [--account <이름>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--clear-tags] [--data <경로>]';

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-edit-');

  const data = path.join(directory, 'data.json');
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-03-01' });
  const original = {
    version: 1,
    nextId: 3,
    transactions: [
      {
        id: 1, date: '2026-02-27', type: 'income', amount: 40000, category: '용돈',
        account: '현금', memo: '2월분', tags: [],
      },
      {
        id: 2, date: '2026-03-01', type: 'expense', amount: 6000, category: '식비',
        account: '카드', memo: '아침', tags: ['외식'],
      },
    ],
  };

  function run(...args) {
    return runCli(['edit', ...args], { env });
  }

  function read() {
    return readJson(data);
  }

  return { directory, data, original, run, read };
}

test('준 값만 바꾸고 다른 거래와 다음 번호를 보존한다', (t) => {
  const { directory, original, run } = fixture(t);
  const override = path.join(directory, 'override.json');
  writeJson(override, original);

  const { status, stdout, stderr } = run('2', '--amount', '1만2천', '--memo', '점심', '--data', override);

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '수정했습니다: #2 2026-03-01 지출 12,000원 식비 점심 #외식\n');
  assert.deepEqual(readJson(override), currentData({
    nextId: original.nextId,
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }],
    transactions: [original.transactions[0], { ...original.transactions[1], amount: 12000, memo: '점심' }],
  }));
  assert.deepEqual(readdirSync(directory), ['override.json']);
});

test('분류만 바꾸면 기존 금액, 날짜, 유형과 메모를 보존한다', (t) => {
  const { data, original, run, read } = fixture(t);
  writeJson(data, original);

  const { status, stdout, stderr } = run('1', '--category', '급여');

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '수정했습니다: #1 2026-02-27 수입 40,000원 급여 2월분\n');
  assert.deepEqual(read(), currentData({
    nextId: original.nextId,
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }],
    transactions: [{ ...original.transactions[0], category: '급여' }, original.transactions[1]],
  }));
});

test('금액과 날짜를 정규화하고 빈 메모로 기존 메모를 지운다', (t) => {
  const { data, original, run, read } = fixture(t);
  writeJson(data, original);

  const { status, stdout, stderr } = run('2',
    '--type', 'income', '--category', '급여', '--date', '어제', '--amount', '5000원', '--memo', '');

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '수정했습니다: #2 2026-02-28 수입 5,000원 급여 #외식\n');
  assert.deepEqual(read().transactions[1], {
    ...original.transactions[1], type: 'income', category: '급여', date: '2026-02-28', amount: 5000, memo: '',
  });
});

test('잘못된 사용법을 데이터 읽기 전에 보고하고 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  for (const [args, message] of [
    [[], '번호가 없습니다'],
    ...['0', '-1', 'abc', '1.5', '01', '+1', '9007199254740992'].map(
      (id) => [[id, '--memo', 'x'], `번호는 양의 정수여야 합니다: ${id}`],
    ),
    [['1', '2', '--memo', 'x'], '예상하지 않은 인자입니다: 2'],
    [['1'], '바꿀 값이 없습니다'],
    [['1', '--data', data], '바꿀 값이 없습니다'],
    [['1', '--amount', '0'], '금액은 양의 정수여야 합니다: 0'],
    [['1', '--amount', '1.5만'], '금액은 양의 정수여야 합니다: 1.5만'],
    [['1', '--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
    [['1', '--category', ''], '--category 값이 비었습니다'],
    [['1', '--date', '02-30'], '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 02-30'],
    [['1', '--memo', 'x', '--data', ''], '--data 값이 비었습니다'],
    [['1', '--nope', 'x'], '알 수 없는 옵션입니다: --nope'],
    ...['amount', 'type', 'category', 'date', 'memo', 'data'].map(
      (option) => [['1', `--${option}`], `--${option} 값이 없습니다`],
    ),
  ]) {
    assertUsageError(run(...args), message, usage);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('수정 결과의 구분에 분류가 등록되지 않으면 거래를 보존한다', (t) => {
  const { data, original, run } = fixture(t);
  const saved = JSON.stringify(original);
  writeFileSync(data, saved);

  for (const [args, name] of [
    [['--category', '커피'], '커피'],
    [['--type', 'income'], '식비'],
    [['--type', 'income', '--category', '교통'], '교통'],
  ]) {
    const { status, stdout, stderr } = run('2', ...args);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 없는 분류입니다: ${name} (gagyebu category add로 더하세요)\n`);
    assert.equal(readFileSync(data, 'utf8'), saved);
  }
});

test('구분과 분류를 건드리지 않는 수정은 기존 분류를 검사하지 않는다', (t) => {
  const { data, original, run, read } = fixture(t);
  const saved = currentData({
    nextId: original.nextId,
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }],
    categories: { ...DEFAULT_CATEGORIES, expense: ['기타'] },
    transactions: original.transactions,
  });
  writeJson(data, saved);

  const { status, stderr } = run('2', '--memo', '점심');
  assert.equal(status, 0, stderr);
  assert.deepEqual(read().transactions[1], { ...original.transactions[1], memo: '점심' });
});

test('없는 번호를 보고하고 데이터 파일을 만들거나 바꾸지 않는다', (t) => {
  const { directory, data, original, run } = fixture(t);

  function assertMissing() {
    const { status, stdout, stderr } = run('99', '--memo', 'x');
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, '오류: 거래 #99가 없습니다\n');
  }

  assertMissing();
  assert.deepEqual(readdirSync(directory), []);

  const saved = JSON.stringify(original);
  writeFileSync(data, saved);
  assertMissing();
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('거래 배열이 잘못되면 데이터 오류를 보고한다', (t) => {
  const { data, original, run } = fixture(t);
  const saved = JSON.stringify({ ...original, transactions: {} });
  writeFileSync(data, saved);

  const { status, stdout, stderr } = run('1', '--memo', 'x');
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (transactions가 올바르지 않습니다)\n`);
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('edit --help는 사용법을 한 줄로 출력한다', (t) => {
  const { directory, run } = fixture(t);
  const { status, stdout, stderr } = run('--help');
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
  assert.deepEqual(readdirSync(directory), []);
});

test('태그를 교체하거나 모두 지우는 옵션만으로 거래를 수정한다', (t) => {
  const { data, original, run, read } = fixture(t);
  writeJson(data, original);

  assert.equal(run('2', '--tag', ' #회식 ', '--tag=법인,회식').status, 0);
  assert.deepEqual(read().transactions[1], { ...original.transactions[1], tags: ['회식', '법인'] });

  assert.equal(run('2', '--clear-tags').status, 0);
  assert.deepEqual(read().transactions[1], { ...original.transactions[1], tags: [] });
});

test('태그 교체와 지우기를 함께 쓰거나 지우기에 값을 주면 파일을 보존한다', (t) => {
  const { data, original, run } = fixture(t);
  const saved = JSON.stringify(original);
  writeFileSync(data, saved);

  for (const [args, message] of [
    [['--tag', '회식', '--clear-tags'], '--tag와 --clear-tags는 함께 쓸 수 없습니다'],
    [['--clear-tags=x'], '--clear-tags는 값을 받지 않습니다'],
  ]) {
    assertUsageError(run('2', ...args), message, usage);
    assert.equal(readFileSync(data, 'utf8'), saved);
  }
});

test('계좌 옵션만으로 거래를 수정하고 없는 계좌를 거부한다', (t) => {
  const { data, original, run, read } = fixture(t);
  writeJson(data, original);
  const edited = run('1', '--account', '카드');
  assert.equal(edited.status, 0, edited.stderr);
  assert.deepEqual(read().transactions, [{ ...original.transactions[0], account: '카드' }, original.transactions[1]]);

  const saved = readFileSync(data, 'utf8');
  const unknown = run('1', '--account', '없는통장');
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr, '오류: 없는 계좌입니다: 없는통장 (gagyebu account add로 더하세요)\n');
  assertUsageError(run('1', '--account', ''), '--account 값이 비었습니다', usage);
  assertUsageError(run('1', '--account'), '--account 값이 없습니다', usage);
  assert.equal(readFileSync(data, 'utf8'), saved);
});
