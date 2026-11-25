import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertUsageError, readJson, runCli, tempDir, testEnv, writeJson, currentData } from './helpers.js';

const usage = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--account <이름>] [--date YYYY-MM-DD] [--memo <글>] [--tag <태그>] [--data <경로>]';

function fixture(t, envOverrides = {}) {
  const directory = tempDir(t, 'gagyebu-add-');

  const data = path.join(directory, 'data.json');
  const envData = path.join(directory, 'env.json');
  const env = testEnv(directory, { GAGYEBU_DATA: envData, ...envOverrides });

  function run(...args) {
    return runCli(['add', ...args], { env });
  }

  function read(filePath = data) {
    return readJson(filePath);
  }

  return { directory, data, envData, run, read };
}

test('모든 옵션을 받아 거래를 저장하고 지정한 경로를 우선한다', (t) => {
  const { data, directory, run, read } = fixture(t);
  const result = run('12300', '--type', 'income', '--category', '급여',
    '--date', '2026-02-28', '--memo', '11월분', '--data', data);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '추가했습니다: #1 2026-02-28 수입 12,300원 급여 11월분\n');
  assert.deepEqual(readdirSync(directory), ['data.json']);
  assert.deepEqual(read(), currentData({
    nextId: 2,
    transactions: [{
      id: 1, date: '2026-02-28', type: 'income', amount: 12300, category: '급여',
      account: '현금', memo: '11월분', tags: [],
    }],
  }));
});

test('거래 기본값과 로컬 날짜를 저장한다', (t) => {
  for (const timeZone of ['Pacific/Kiritimati', 'Etc/GMT+12']) {
    const { data, run, read } = fixture(t, { TZ: timeZone });
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    });
    const before = formatter.format(new Date());
    const result = run('5000', '--data', data);
    const after = formatter.format(new Date());

    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const [transaction] = read().transactions;
    assert.ok([before, after].includes(transaction.date), timeZone);
    assert.deepEqual(transaction, {
      id: 1, date: transaction.date, type: 'expense', amount: 5000, category: '기타',
      account: '현금', memo: '', tags: [],
    });
    assert.equal(result.stdout, `추가했습니다: #1 ${transaction.date} 지출 5,000원 기타\n`);
  }
});

test('거래 구분에 등록되지 않은 분류를 거부하고 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = JSON.stringify({ version: 1, nextId: 1, transactions: [] });
  writeFileSync(data, original);

  for (const [type, category] of [['expense', '커피'], ['income', '식비']]) {
    const { status, stdout, stderr } = run('1000', '--type', type, '--category', category, '--data', data);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 없는 분류입니다: ${category} (gagyebu category add로 더하세요)\n`);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('한글 단위 금액과 상대 날짜를 정규화해 출력하고 저장한다', (t) => {
  const { data, run, read } = fixture(t, { GAGYEBU_TODAY: '2026-03-01' });
  const { status, stdout, stderr } = run('1만2천', '--date', '어제', '--data', data);

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '추가했습니다: #1 2026-02-28 지출 12,000원 기타\n');
  assert.deepEqual(read().transactions, [{
    id: 1, date: '2026-02-28', type: 'expense', amount: 12000, category: '기타',
    account: '현금', memo: '', tags: [],
  }]);
});

test('연도를 생략한 날짜와 설정한 기본 날짜를 저장한다', (t) => {
  const { data, run, read } = fixture(t, { GAGYEBU_TODAY: '2026-03-01' });

  for (const args of [['12,000원', '--date', '3/5'], ['1만 2000', '--date', '03-05'], ['5천']]) {
    const result = run(...args, '--data', data);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
  }
  assert.deepEqual(read().transactions.map(({ date, amount }) => [date, amount]), [
    ['2026-03-05', 12000], ['2026-03-05', 12000], ['2026-03-01', 5000],
  ]);
});

test('설정한 기준일이 잘못되면 처리 오류를 보고하고 저장하지 않는다', (t) => {
  const { directory, run } = fixture(t, { GAGYEBU_TODAY: '2026-13-01' });
  const { status, stdout, stderr } = run('1');

  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: GAGYEBU_TODAY가 YYYY-MM-DD가 아닙니다: 2026-13-01\n');
  assert.deepEqual(readdirSync(directory), []);
});

test('같은 파일에 다시 추가하면 기존 거래를 보존하고 id를 올린다', (t) => {
  const { data, run, read } = fixture(t);
  assert.equal(run('10', '--data', data).status, 0);
  const [first] = read().transactions;
  const result = run('20', '--data', data);
  const { nextId, transactions } = read();

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^추가했습니다: #2 /);
  assert.deepEqual(transactions.map(({ id }) => id), [1, 2]);
  assert.deepEqual(transactions[0], first);
  assert.equal(nextId, 3);
});

test('id는 기존 nextId를 쓰고 경로를 생략하면 GAGYEBU_DATA에 저장한다', (t) => {
  const { envData, run, read } = fixture(t);
  writeJson(envData, { version: 1, nextId: 10, transactions: [] });
  const result = run('012', '--memo=');

  assert.equal(result.status, 0);
  assert.match(result.stdout, /^추가했습니다: #10 .+ 지출 12원 기타\n$/);
  const saved = read(envData);
  assert.equal(saved.transactions[0].id, 10);
  assert.equal(saved.transactions[0].amount, 12);
  assert.equal(saved.nextId, 11);
});

test('잘못된 사용법을 거부하고 데이터 파일을 만들지 않는다', (t) => {
  const { directory, data, run } = fixture(t);
  const invalidAmount = '금액은 양의 정수여야 합니다: ';
  const invalidDate = '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ';

  for (const [args, message] of [
    [[], '금액이 없습니다'],
    [['0'], invalidAmount + '0'],
    [['-5'], invalidAmount + '-5'],
    [['1.5'], invalidAmount + '1.5'],
    [['abc'], invalidAmount + 'abc'],
    [['9007199254740993'], invalidAmount + '9007199254740993'],
    [['1\n'], invalidAmount + '1\\n'],
    [['1,20,0'], invalidAmount + '1,20,0'],
    [['1.5만'], invalidAmount + '1.5만'],
    [['0원'], invalidAmount + '0원'],
    [['1만 '], invalidAmount + '1만 '],
    [['1', '2'], '예상하지 않은 인자입니다: 2'],
    [['1', '--nope'], '알 수 없는 옵션입니다: --nope'],
    [['1', '--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
    [['1', '--date', '2026-02-30'], invalidDate + '2026-02-30'],
    [['1', '--date', '2026-13-01'], invalidDate + '2026-13-01'],
    [['1', '--date', '2026-02-29'], invalidDate + '2026-02-29'],
    [['1', '--date', '2026-2-3'], invalidDate + '2026-2-3'],
    [['1', '--date', '13/1'], invalidDate + '13/1'],
    [['1', '--date', '내일'], invalidDate + '내일'],
    [['1', '--date', '02-30'], invalidDate + '02-30'],
    [['1', '--date', '2026-02-30\r\n추가 줄'], invalidDate + '2026-02-30\\r\\n추가 줄'],
    [['1', '--category='], '--category 값이 비었습니다'],
    [['1', '--data='], '--data 값이 비었습니다'],
    [['1', '--data', ''], '--data 값이 비었습니다'],
    [['1', '--help=nope'], '--help는 값을 받지 않습니다'],
  ]) {
    assertUsageError(run('--data', data, ...args), message, usage);
  }
  for (const [option, message] of [
    ['--type', '--type 값이 없습니다'],
    ['--category', '--category 값이 없습니다'],
    ['--date', '--date 값이 없습니다'],
    ['--memo', '--memo 값이 없습니다'],
    ['--tag', '--tag 값이 없습니다'],
    ['--data', '--data 값이 없습니다'],
  ]) {
    assertUsageError(run('1', option), message, usage);
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('사용법 오류를 파일 읽기보다 먼저 보고하고 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  assertUsageError(run('10', '--data', data, '--nope'), '알 수 없는 옵션입니다: --nope', usage);
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('add --help는 사용법을 한 줄로 출력한다', (t) => {
  const { directory, run } = fixture(t);
  const { status, stdout, stderr } = run('--help');
  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
  assert.deepEqual(readdirSync(directory), []);
});

test('깨진 JSON과 잘못된 데이터 구조를 처리 오류로 보고한다', (t) => {
  const { data, directory, run } = fixture(t);

  for (const [original, reason] of [
    ['{깨진 JSON', 'JSON 형식이 잘못되었습니다'],
    [JSON.stringify({ version: 1, nextId: 1, transactions: {} }), 'transactions가 올바르지 않습니다'],
    [JSON.stringify({ version: 1, nextId: 0, transactions: [] }), 'nextId 또는 transactions가 올바르지 않습니다'],
  ]) {
    writeFileSync(data, original);
    const { status, stdout, stderr } = run('1', '--data', data);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (${reason})\n`);
    assert.equal(readFileSync(data, 'utf8'), original);
    assert.deepEqual(readdirSync(directory), ['data.json']);
  }
});

test('실제로 있는 윤일과 100년 이전 날짜를 받는다', (t) => {
  const { data, run, read } = fixture(t);

  for (const date of ['2024-02-29', '0096-02-29']) {
    const result = run('1', '--date', date, '--data', data);
    assert.equal(result.status, 0);
    assert.equal(read().transactions.at(-1).date, date);
  }
});

test('반복 태그를 정규화해 저장하고 확인 줄에 표시한다', (t) => {
  const { data, run, read } = fixture(t);
  const { status, stdout, stderr } = run('1000', '--date', '2026-03-01',
    '--tag', '회식', '--tag', ' #법인,회식 ', '--data', data);

  assert.equal(status, 0);
  assert.equal(stderr, '');
  assert.equal(stdout, '추가했습니다: #1 2026-03-01 지출 1,000원 기타 #회식 #법인\n');
  assert.deepEqual(read().transactions[0].tags, ['회식', '법인']);

  const saved = readFileSync(data, 'utf8');
  assertUsageError(run('1000', '--tag', 'a b', '--data', data), '태그는 공백 없는 1~20자여야 합니다: a b', usage);
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('거래에 등록한 계좌를 저장하고 계좌를 생략하면 현금을 쓴다', (t) => {
  const { envData, run, read } = fixture(t);
  const data = currentData();
  data.accounts.push({ name: '카드', opening: -50000 });
  writeJson(envData, data);

  for (const args of [['--account', '카드'], []]) {
    const { status, stderr } = run('1000', ...args);
    assert.equal(status, 0, stderr);
  }
  assert.deepEqual(read(envData).transactions.map(({ account }) => account), ['카드', '현금']);

  const original = readFileSync(envData, 'utf8');
  const unknown = run('1000', '--account', '없는통장');
  assert.equal(unknown.status, 1);
  assert.equal(unknown.stderr, '오류: 없는 계좌입니다: 없는통장 (gagyebu account add로 더하세요)\n');
  assertUsageError(run('1000', '--account', ''), '--account 값이 비었습니다', usage);
  assertUsageError(run('1000', '--account'), '--account 값이 없습니다', usage);
  assert.equal(readFileSync(envData, 'utf8'), original);
});
