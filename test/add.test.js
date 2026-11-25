import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));
const usage = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

function fixture(t, envOverrides = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gagyebu-add-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const data = path.join(directory, 'data.json');
  const envData = path.join(directory, 'env.json');
  const env = { ...process.env, GAGYEBU_DATA: envData };
  delete env.GAGYEBU_TODAY;
  Object.assign(env, envOverrides);

  function run(...args) {
    const result = spawnSync(process.execPath, [binPath, 'add', ...args], { encoding: 'utf8', env });
    assert.ifError(result.error);
    return result;
  }

  function read(filePath = data) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  }

  return { directory, data, envData, run, read };
}

function assertUsageError({ status, stdout, stderr }, message) {
  assert.equal(status, 2, message);
  assert.equal(stdout, '', message);
  assert.match(stderr, /^오류: [^\n]+\n[^\n]+\n$/, message);
  assert.equal(stderr.split('\n')[1], usage, message);
}

test('모든 옵션을 받아 거래를 저장하고 지정한 경로를 우선한다', (t) => {
  const { data, directory, run, read } = fixture(t);
  const result = run('12300', '--type', 'income', '--category', '월급',
    '--date', '2026-02-28', '--memo', '11월분', '--data', data);

  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, '추가했습니다: #1 2026-02-28 수입 12,300원 월급 11월분\n');
  assert.deepEqual(readdirSync(directory), ['data.json']);
  assert.deepEqual(read(), {
    version: 1,
    nextId: 2,
    transactions: [{
      id: 1, date: '2026-02-28', type: 'income', amount: 12300, category: '월급',
      account: '현금', memo: '11월분', tags: [],
    }],
  });
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

test('설정한 기준일이 잘못되면 공용 사용법을 출력하고 저장하지 않는다', (t) => {
  const { directory, data, run } = fixture(t, { GAGYEBU_TODAY: '2026-02-30' });
  const { status, stdout, stderr } = run('1', '--data', data);

  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: GAGYEBU_TODAY는 YYYY-MM-DD 형식의 있는 날이어야 합니다: 2026-02-30\n'
    + '사용법은 gagyebu help를 보세요.\n');
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
  writeFileSync(envData, JSON.stringify({ version: 1, nextId: 10, transactions: [] }));
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

  for (const args of [
    [], ['0'], ['-5'], ['1.5'], ['abc'], ['9007199254740993'], ['1\n'],
    ['1,20,0'], ['1.5만'], ['0원'], ['1만 '],
    ['1', '2'], ['1', '--nope'], ['1', '--type', 'transfer'],
    ['1', '--date', '2026-02-30'], ['1', '--date', '2026-13-01'],
    ['1', '--date', '2026-02-29'], ['1', '--date', '2026-2-3'],
    ['1', '--date', '13/1'], ['1', '--date', '내일'],
    ['1', '--category='], ['1', '--data='], ['1', '--data', ''], ['1', '--help=nope'],
    ['1', '--date', '2026-02-30\r\n추가 줄'],
  ]) {
    assertUsageError(run('--data', data, ...args), JSON.stringify(args));
  }
  for (const option of ['type', 'category', 'date', 'memo', 'data']) {
    assertUsageError(run('1', `--${option}`), `--${option}`);
  }
  const invalidDate = run('1', '--date', '02-30', '--data', data);
  assertUsageError(invalidDate);
  assert.equal(invalidDate.stderr,
    `오류: 날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 02-30\n${usage}\n`);
  assert.deepEqual(readdirSync(directory), []);
});

test('사용법 오류를 파일 읽기보다 먼저 보고하고 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  assertUsageError(run('10', '--data', data, '--nope'));
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

  for (const original of [
    '{깨진 JSON',
    JSON.stringify({ version: 1, nextId: 1, transactions: {} }),
    JSON.stringify({ version: 1, nextId: 0, transactions: [] }),
  ]) {
    writeFileSync(data, original);
    const { status, stdout, stderr } = run('1', '--data', data);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /^오류: 데이터 파일을 읽을 수 없습니다: [^\n]+\n$/);
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
