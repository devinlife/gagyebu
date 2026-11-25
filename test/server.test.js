import assert from 'node:assert/strict';
import { once } from 'node:events';
import { writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { createServer } from '../src/server.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';
import { runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const today = '2026-02-10';

async function fixture(t) {
  const env = testEnv(tempDir(t), { GAGYEBU_TODAY: today });
  const data = env.GAGYEBU_DATA;
  writeJson(data, {
    version: CURRENT_VERSION,
    nextId: 5,
    categories: DEFAULT_CATEGORIES,
    budgets: { 식비: 1500 },
    transactions: [
      transaction({ id: 4, type: 'income', category: '급여' }),
      transaction({ id: 3, date: '2026-03-01', category: '교통', account: '카드', tags: ['a'] }),
      transaction({ id: 2, account: '카드', tags: ['a', 'b'] }),
      transaction({ id: 1, date: '2026-02-01', tags: ['b'] }),
    ],
  });

  const previousToday = process.env.GAGYEBU_TODAY;
  process.env.GAGYEBU_TODAY = today;
  t.after(() => {
    if (previousToday === undefined) {
      delete process.env.GAGYEBU_TODAY;
    } else {
      process.env.GAGYEBU_TODAY = previousToday;
    }
  });

  const server = createServer({ data });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, status = 200, method = 'GET') {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
    return { body: method === 'HEAD' ? await response.text() : await response.json(), headers: response.headers };
  }

  function cli(...args) {
    return runCli([...args, '--data', data], { env });
  }

  function cliJson(...args) {
    const { status, stdout, stderr } = cli(...args, '--json');
    assert.equal(status, 0, stderr);
    assert.equal(stderr, '');
    return JSON.parse(stdout);
  }

  return { cli, cliJson, data, request };
}

test('거래 API의 필터와 정렬은 CLI 목록과 같다', async (t) => {
  const { cliJson, request } = await fixture(t);
  for (const [query, args] of [
    ['', []],
    ['?from=2026-02-10&to=2026-02-28', ['--from', '2026-02-10', '--to', '2026-02-28']],
    ['?type=income', ['--type', 'income']],
    ['?category=식비', ['--category', '식비']],
    ['?account=카드', ['--account', '카드']],
    ['?tag=a&tag=b', ['--tag', 'a', '--tag', 'b']],
    ['?from=&to=&type=&category=&account=&tag=', []],
    ['?type=income&type=expense&tag=&tag=b', ['--type', 'expense', '--tag', 'b']],
    ['?type=income&type=', []],
  ]) {
    const { body } = await request(`/api/transactions${query}`);
    assert.deepEqual(body, cliJson('list', ...args), query);
  }
});

test('요약과 연간 보고 API는 명시한 달·해와 기본값에서 CLI와 같다', async (t) => {
  const { cliJson, request } = await fixture(t);
  for (const [path, args] of [
    ['/api/summary?month=2026-02', ['summary', '--month', '2026-02']],
    ['/api/summary', ['summary']],
    ['/api/report?year=2026', ['report', '--year', '2026']],
    ['/api/report', ['report']],
  ]) {
    const { body } = await request(path);
    assert.deepEqual(body, cliJson(...args));
  }
});

test('잘못된 쿼리는 400과 오류 문구를 돌려준다', async (t) => {
  const { cli, request } = await fixture(t);
  for (const [path, args] of [
    ['/api/transactions?from=2026-13-01', ['list', '--from', '2026-13-01']],
    ['/api/transactions?type=x', ['list', '--type', 'x']],
    ['/api/transactions?from=2026-03-01&to=2026-02-01', ['list', '--from', '2026-03-01', '--to', '2026-02-01']],
    ['/api/transactions?tag=a+b', ['list', '--tag', 'a b']],
    ['/api/summary?month=2026-2', ['summary', '--month', '2026-2']],
    ['/api/report?year=26', ['report', '--year', '26']],
  ]) {
    const { status, stderr } = cli(...args);
    assert.equal(status, 2, stderr);
    const { body } = await request(path, 400);
    assert.deepEqual(body, { error: stderr.split('\n')[0].slice('오류: '.length) });
  }
  for (const path of ['/api/transactions', '/api/summary', '/api/report']) {
    const { body } = await request(`${path}?unknown=x`, 400);
    assert.deepEqual(body, { error: '알 수 없는 매개변수입니다: unknown' });
  }
  const { body } = await request('/api/transactions??type=expense', 400);
  assert.deepEqual(body, { error: '알 수 없는 매개변수입니다: ?type' });
});

test('없는 경로, 허용하지 않는 메서드, 데이터 파일 오류에 상태와 오류 문구를 보낸다', async (t) => {
  const { cli, data, request } = await fixture(t);
  for (const [path, method] of [
    ['/', 'GET'], ['//', 'GET'], ['//x/api/summary', 'GET'], ['//api/summary', 'GET'],
    ['/api/nope', 'GET'], ['/api/nope', 'POST'],
  ]) {
    const { body } = await request(path, 404, method);
    assert.deepEqual(body, { error: `없는 경로입니다: ${path}` });
  }

  const { body, headers } = await request('/api/transactions', 405, 'POST');
  assert.equal(headers.get('allow'), 'GET');
  assert.deepEqual(body, { error: 'GET만 받습니다: POST' });
  const head = await request('/api/summary', 405, 'HEAD');
  assert.equal(head.headers.get('allow'), 'GET');
  assert.equal(head.body, '');

  writeFileSync(data, '{깨진 JSON');
  for (const [api, command] of [['transactions', 'list'], ['summary', 'summary'], ['report', 'report']]) {
    const { status, stderr } = cli(command);
    assert.equal(status, 1, stderr);
    const { body } = await request(`/api/${api}`, 500);
    assert.deepEqual(body, { error: stderr.trimEnd().slice('오류: '.length) });
  }
});

test('서버 실행 중 CLI로 추가한 거래가 다음 요청에 보인다', async (t) => {
  const { cli, cliJson, request } = await fixture(t);
  const before = await request('/api/transactions');
  const { status, stderr } = cli('add', '3500', '--category', '식비');
  assert.equal(status, 0, stderr);
  const after = await request('/api/transactions');
  assert.equal(after.body.length, before.body.length + 1);
  assert.deepEqual(after.body, cliJson('list'));
});
