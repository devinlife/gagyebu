import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));
const usage = '사용법: gagyebu add <금액> [--type expense|income] [--category <분류>] [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gagyebu-add-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));

  const data = path.join(directory, 'data.json');
  const envData = path.join(directory, 'env.json');
  const env = { ...process.env, GAGYEBU_DATA: envData };

  function run(...args) {
    const result = spawnSync(process.execPath, [binPath, 'add', ...args], { encoding: 'utf8', env });
    assert.ifError(result.error);
    return result;
  }

  function read(filePath = data) {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  }

  return { directory, data, envData, env, run, read };
}

function assertUsageError({ status, stdout, stderr }, message) {
  assert.equal(status, 2, message);
  assert.equal(stdout, '', message);
  assert.match(stderr, /^오류: [^\n]+\n[^\n]+\n$/, message);
  assert.equal(stderr.split('\n')[1], usage, message);
}

function localDate() {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
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
  const { data, run, read } = fixture(t);
  const before = localDate();
  const result = run('5000', '--data', data);
  const after = localDate();
  const { transactions } = read();
  const [transaction] = transactions;

  assert.ok([before, after].includes(transaction.date));
  assert.deepEqual(transaction, {
    id: 1, date: transaction.date, type: 'expense', amount: 5000, category: '기타',
    account: '현금', memo: '', tags: [],
  });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `추가했습니다: #1 ${transaction.date} 지출 5,000원 기타\n`);
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
    [], ['0'], ['-5'], ['1.5'], ['abc'], ['1,000'], ['9007199254740993'], ['1\n'],
    ['1', '2'], ['1', '--nope'], ['1', '--type', 'transfer'],
    ['1', '--date', '2026-02-30'], ['1', '--date', '2026-13-01'],
    ['1', '--date', '2026-02-29'], ['1', '--date', '2026-2-3'], ['1', '--date', '오늘'],
    ['1', '--category='], ['1', '--help=nope'],
  ]) {
    assertUsageError(run('--data', data, ...args), JSON.stringify(args));
  }
  for (const option of ['type', 'category', 'date', 'memo', 'data']) {
    assertUsageError(run('1', `--${option}`), `--${option}`);
  }
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
    JSON.stringify({ version: 1, nextId: Number.MAX_SAFE_INTEGER, transactions: [] }),
  ]) {
    writeFileSync(data, original);
    const { status, stdout, stderr } = run('1', '--data', data);
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.match(stderr, /^오류: 데이터 파일을 (읽을|쓸) 수 없습니다: [^\n]+\n$/);
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

test('분류와 메모의 개행은 저장하고 성공 출력은 한 줄로 유지한다', (t) => {
  const { data, run, read } = fixture(t);
  const { status, stdout } = run('1', '--date', '2026-02-28', '--category', '식비\r\n간식',
    '--memo', '첫 줄\n둘째 줄', '--data', data);

  assert.equal(status, 0);
  assert.equal(stdout, '추가했습니다: #1 2026-02-28 지출 1원 식비\\r\\n간식 첫 줄\\n둘째 줄\n');
  assert.equal(read().transactions[0].category, '식비\r\n간식');
  assert.equal(read().transactions[0].memo, '첫 줄\n둘째 줄');
});

test('동시에 거래를 추가해도 성공한 거래가 덮어써지지 않는다', async (t) => {
  const { data, env, read } = fixture(t);
  const amounts = [11, 22, 33, 44, 55, 66, 77, 88];
  const results = await Promise.all(amounts.map((amount) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [binPath, 'add', String(amount), '--data', data], { env });
    let stderr = '';
    child.stdout.resume();
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stderr, amount }));
  })));

  const successful = [];
  for (const { status, stderr, amount } of results) {
    if (status === 0) {
      assert.equal(stderr, '');
      successful.push(amount);
    } else {
      assert.equal(status, 1);
      assert.match(stderr, /다른 작업이 이 데이터 파일을 사용 중입니다/);
    }
  }
  assert.ok(successful.length > 0);

  const { nextId, transactions } = read();
  assert.deepEqual(transactions.map(({ amount }) => amount).sort(), successful.sort());
  assert.deepEqual(transactions.map(({ id }) => id), successful.map((_, index) => index + 1));
  assert.equal(nextId, successful.length + 1);
});
