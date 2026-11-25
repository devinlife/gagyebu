import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync, writeFileSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { test } from 'node:test';
import { createServer } from '../src/server.js';
import { escapeHtml } from '../src/web.js';
import { currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const today = '2026-02-10';

async function fixture(t) {
  const env = testEnv(tempDir(t), { GAGYEBU_TODAY: today });
  const data = env.GAGYEBU_DATA;
  writeJson(data, currentData({
    nextId: 8,
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }],
    budgets: { 식비: 1500, 교통: 2000 },
    transactions: [
      transaction({ id: 7, date: '2026-01-31', type: 'income', amount: 5000, category: '급여', account: '카드' }),
      transaction({ id: 6, amount: 500, category: '기타' }),
      transaction({ id: 5, category: '교통' }),
      transaction({ id: 4, type: 'income', category: '급여' }),
      transaction({ id: 3, date: '2026-03-01', category: '교통', account: '카드', tags: ['a'] }),
      transaction({ id: 2, account: '카드', memo: '점심 결제', tags: ['a', 'b'] }),
      transaction({ id: 1, date: '2026-02-01', tags: ['b'] }),
    ],
  }));

  const previousToday = process.env.GAGYEBU_TODAY;
  if (previousToday !== today) {
    process.env.GAGYEBU_TODAY = today;
    t.after(() => {
      if (previousToday === undefined) {
        delete process.env.GAGYEBU_TODAY;
      } else {
        process.env.GAGYEBU_TODAY = previousToday;
      }
    });
  }

  const server = createServer({ data });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeAllConnections();
  }));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;

  async function request(path, status = 200, method = 'GET', contentType = 'application/json') {
    const response = await fetch(base + path, { method });
    assert.equal(response.status, status, path);
    assert.equal(response.headers.get('content-type'), `${contentType}; charset=utf-8`);
    const body = contentType === 'application/json' && method !== 'HEAD'
      ? await response.json()
      : await response.text();
    return { body, headers: response.headers };
  }

  function html(path, status, method) {
    return request(path, status, method, 'text/html');
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

  return { base, cli, cliJson, data, html, request };
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
    ['//', 'GET'], ['//x/api/summary', 'GET'], ['//api/summary', 'GET'],
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

test('월 보고서에는 합계, 지출 분류, 거래, 월말 잔액이 나온다', async (t) => {
  const { html } = await fixture(t);
  const { body } = await html('/?month=2026-02');

  assert.match(body, /^<!doctype html>/);
  assert.match(body, /<html lang="ko">/);
  assert.match(body, /<meta charset="utf-8">/);
  assert.match(body, /<meta name="viewport" content="width=device-width, initial-scale=1">/);
  assert.match(body, /<title>2026년 2월 가계부<\/title>/);
  assert.match(body, /<h1>2026년 2월 가계부<\/h1>/);
  assert.match(body, /<dt>수입<\/dt><dd>1,000원<\/dd>/);
  assert.match(body, /<dt>지출<\/dt><dd>3,500원<\/dd>/);
  assert.match(body, /<dt>차액<\/dt><dd>-2,500원<\/dd>/);
  const rows = Array.from(body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g), ([, attributes, content]) => ({
    attributes,
    cells: Array.from(content.matchAll(/<td\b[^>]*>([^<]*)<\/td>/g), ([, text]) => text),
  }));
  assert.deepEqual(rows.filter(({ cells: [first] }) => ['식비', '교통', '기타'].includes(first)), [
    { attributes: ' class="over"', cells: ['식비', '2,000원', '57.1%', '1,500원', '133.3%', '초과 500원'] },
    { attributes: '', cells: ['교통', '1,000원', '28.6%', '2,000원', '50.0%', ''] },
    { attributes: '', cells: ['기타', '500원', '14.3%', '', '', ''] },
  ]);
  assert.match(body, /\.over\s*\{\s*color:/);
  assert.deepEqual(rows.find(({ cells }) => cells.includes('점심 결제'))?.cells, [
    '2026-02-10', '지출', '1,000원', '식비', '카드', '점심 결제', '#a #b',
  ]);
  assert.doesNotMatch(body, /2026-01-31|2026-03-01/);
  assert.match(body, /2026-02-28 기준/);
  assert.match(body, /<td>카드<\/td><td class="number">4,000원<\/td>/);
  assert.match(body, /<th scope="row">합계<\/th><td class="number">2,500원<\/td>/);
  assert.match(body, /<th scope="col">/);
  assert.equal(body.match(/<div class="table-wrap">\s*<table>/g)?.length, 3);
  assert.match(body, /\.table-wrap\s*\{\s*overflow-x: auto/);
  assert.equal(body.match(/<style>/g)?.length, 1);
  assert.doesNotMatch(body, /<script|<link|https?:\/\//i);
});

test('빈 달 매개변수는 이번 달을 쓰고 이웃 달 링크는 해를 넘긴다', async (t) => {
  const { html } = await fixture(t);

  for (const path of ['/', '/?month=']) {
    const { body } = await html(path);
    assert.match(body, /<h1>2026년 2월 가계부<\/h1>/, path);
  }
  const december = await html('/?month=2026-12');
  assert.ok(december.body.includes('<a href="/?month=2026-11">이전 달</a>'));
  assert.ok(december.body.includes('<a href="/?month=2027-01">다음 달</a>'));
  const january = await html('/?month=2026-01');
  assert.ok(january.body.includes('<a href="/?month=2025-12">이전 달</a>'));
  const leapFebruary = await html('/?month=2028-02');
  assert.match(leapFebruary.body, /2028-02-29 기준/);
});

test('보고서는 사용자 입력을 이스케이프하고 말일 이체를 거래에 포함한다', async (t) => {
  const { data, html } = await fixture(t);
  const category = '<식비&>';
  const account = '<현금&>';
  const memo = '<script>alert(1)</script>';
  const tag = '<점심&>';
  writeJson(data, currentData({
    nextId: 3,
    accounts: [{ name: account, opening: 2000 }, { name: '카드', opening: 0 }],
    categories: { expense: [category], income: ['급여'] },
    transactions: [
      transaction({ id: 2, date: '2026-02-28', type: 'transfer', category: '', account, toAccount: '카드' }),
      transaction({ id: 1, category, account, memo, tags: [tag] }),
    ],
  }));

  const { body } = await html('/?month=2026-02');
  for (const text of [category, account, memo, tag]) {
    assert.ok(!body.includes(text), text);
  }
  assert.match(body, /<td>&lt;식비&amp;&gt;<\/td>/);
  assert.match(body, /<td>&lt;현금&amp;&gt;<\/td>/);
  assert.match(body, /<td>&lt;script&gt;alert\(1\)&lt;\/script&gt;<\/td>/);
  assert.match(body, /<td>#&lt;점심&amp;&gt;<\/td>/);
  assert.match(body, /2026-02-10[\s\S]*2026-02-28<\/td>\s*<td>이체<\/td>[\s\S]*<td>&lt;현금&amp;&gt;→카드<\/td>/);
  assert.match(body, /<td>카드<\/td><td class="number">1,000원<\/td>/);
});

test('보고서의 잘못된 쿼리, 메서드, 데이터 파일에 HTML 오류를 보낸다', async (t) => {
  const { cli, data, html } = await fixture(t);

  for (const month of ['2026-2', '2026-13']) {
    const { status, stderr } = cli('summary', '--month', month);
    assert.equal(status, 2, stderr);
    const { body } = await html('/?month=' + month, 400);
    assert.match(body, /<h1>400 오류<\/h1>/);
    assert.ok(body.includes(stderr.split('\n')[0].slice('오류: '.length)));
    assert.match(body, /<a href="\/">이번 달 보고서<\/a>/);
  }
  const unknown = await html('/?x=1', 400);
  assert.match(unknown.body, /알 수 없는 매개변수입니다: x/);
  const invalid = await html('/?month=%3C%26%3E', 400);
  assert.match(invalid.body, /--month는 YYYY-MM 형식의 달이어야 합니다: &lt;&amp;&gt;/);

  const post = await html('/', 405, 'POST');
  assert.equal(post.headers.get('allow'), 'GET');
  assert.match(post.body, /<h1>405 오류<\/h1>/);
  assert.match(post.body, /GET만 받습니다: POST/);
  const head = await html('/', 405, 'HEAD');
  assert.equal(head.headers.get('allow'), 'GET');
  assert.equal(head.body, '');

  writeFileSync(data, '{깨진 JSON');
  const { status, stderr } = cli('summary');
  assert.equal(status, 1, stderr);
  const broken = await html('/', 500);
  assert.match(broken.body, /<h1>500 오류<\/h1>/);
  assert.ok(broken.body.includes(stderr.trimEnd().slice('오류: '.length)));
});

test('보고서는 같은 서버 토큰을 쓰고 추가된 거래의 알림을 표시한다', async (t) => {
  const { html } = await fixture(t);
  const first = await html('/');
  const token = formToken(first.body);
  const added = await html('/?added=2');
  assert.ok(added.body.includes(`name="csrf" value="${token}"`));
  assert.match(added.body, /<p role="status">추가했습니다: #2 2026-02-10 지출 1,000원 식비 점심 결제 #a #b<\/p>/);
  assert.doesNotMatch((await html('/?added=99')).body, /role="status"/);
  assert.match((await html('/?added=0', 400)).body, /번호는 양의 정수여야 합니다: 0/);
});

function formToken(html) {
  const token = html.match(/name="csrf" value="([a-f0-9]{64})"/)?.[1];
  assert.ok(token);
  return token;
}

function postForm(base, body, headers) {
  return fetch(base + '/transactions', {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body,
  });
}

test('웹 거래를 저장하고 해당 월의 알림을 표시하며 CLI로 되돌린다', async (t) => {
  const { base, cli, cliJson, data, html } = await fixture(t);
  const csrf = formToken((await html('/')).body);
  const response = await postForm(base, new URLSearchParams({
    amount: '1만2천', type: 'expense', category: '식비', date: '2026-01-15',
    account: '카드', memo: '점심', tags: 'a,#b', csrf, month: '2026-02',
  }), { origin: base, 'content-type': 'Application/X-WWW-Form-Urlencoded; charset=utf-8' });
  assert.equal(response.status, 303);
  assert.equal(await response.text(), '');
  const location = response.headers.get('location');
  assert.equal(location, '/?month=2026-01&added=8');
  const stored = readJson(data);
  assert.equal(stored.nextId, 9);
  assert.deepEqual(stored.transactions.at(-1), transaction({
    id: 8, amount: 12000, date: '2026-01-15', account: '카드', memo: '점심', tags: ['a', 'b'],
  }));
  assert.match((await html(location)).body, /<p role="status">추가했습니다: #8 2026-01-15 지출 12,000원 식비 점심 #a #b<\/p>/);
  const history = cliJson('undo', '--list');
  assert.equal(history.length, 1);
  assert.equal(history[0].command, 'web add 12000 --type expense --category 식비 --account 카드 --date 2026-01-15 --memo 점심 --tag a,b');
  const undone = cli('undo');
  assert.equal(undone.status, 0, undone.stderr);
  assert.equal(readJson(data).nextId, 8);
  assert.equal(readJson(data).transactions.some(({ id }) => id === 8), false);
  assert.deepEqual(cliJson('undo', '--list'), []);
});

test('웹 거래의 빈 칸을 CLI와 같은 기본값으로 채운다', async (t) => {
  const { base, data, html } = await fixture(t);
  const csrf = formToken((await html('/')).body);
  const response = await postForm(base, new URLSearchParams({
    amount: '12,000원', date: '', type: '', category: '', account: '', memo: '', tags: '', csrf,
  }));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/?month=2026-02&added=8');
  await response.text();
  assert.deepEqual(readJson(data).transactions.at(-1), transaction({ id: 8, amount: 12000, category: '기타' }));
});

test('웹 거래 검증 오류의 문구는 CLI와 같고 폼에 제출한 값을 남긴다', async (t) => {
  const { base, cli, cliJson, data, html } = await fixture(t);
  const csrf = formToken((await html('/')).body);
  const before = readFileSync(data, 'utf8');
  for (const [field, overrides, cliArgs, status, retained] of [
    ['amount', { amount: '' }, [], 2, /name="amount"[^>]*value=""/],
    ['amount', { amount: 'abc' }, ['abc'], 2, /name="amount"[^>]*value="abc"/],
    ['type', { type: 'transfer' }, ['1000', '--type', 'transfer'], 2, /<option value="" disabled selected>transfer<\/option>/],
    ['type', { type: '__proto__' }, ['1000', '--type', '__proto__'], 2, /<option value="" disabled selected>__proto__<\/option>/],
    ['category', { type: 'income' }, ['1000', '--type', 'income', '--category', '식비'], 1, /<option value="" disabled selected>식비<\/option>/],
    ['account', { account: '<"미등록">' }, ['1000', '--account', '<"미등록">'], 1, /<option value="" disabled selected>&lt;&quot;미등록&quot;&gt;<\/option>/],
    ['date', { date: '2026-02-30' }, ['1000', '--date', '2026-02-30'], 2, /name="date"[^>]*value="2026-02-30"/],
    ['tags', { tags: 'a b' }, ['1000', '--tag', 'a b'], 2, /name="tags"[^>]*value="a b"/],
  ]) {
    const cliResult = cli('add', ...cliArgs);
    assert.equal(cliResult.status, status, cliResult.stderr);
    const message = cliResult.stderr.split('\n')[0].slice('오류: '.length);
    const response = await postForm(base, new URLSearchParams({
      amount: '1000', type: 'expense', category: '식비', account: '카드', date: today,
      memo: '<script>"</script>', tags: '#a', csrf, month: '2026-01', ...overrides,
    }));
    assert.equal(response.status, 400, field);
    const body = await response.text();
    const errorText = body.match(/<p id="form-error" role="alert">([^<]*)<\/p>\s*<form/)?.[1];
    assert.equal(errorText, escapeHtml(message));
    assert.ok(body.includes(`name="${field}" aria-describedby="form-error" aria-invalid="true"`));
    assert.ok(body.includes(`name="csrf" value="${csrf}"`));
    assert.match(body, retained);
    assert.match(body, /<h1>2026년 1월 가계부<\/h1>/);
    assert.match(body, /name="memo" value="&lt;script&gt;&quot;&lt;\/script&gt;"/);
    assert.equal(readFileSync(data, 'utf8'), before);
  }
  assert.deepEqual(cliJson('undo', '--list'), []);
});

test('웹 거래 요청의 출처, 크기, 형식, 칸 이름과 토큰을 순서대로 거른다', async (t) => {
  const { base, cliJson, data, html } = await fixture(t);
  const other = await fixture(t);
  const csrf = formToken((await html('/')).body);
  const otherToken = formToken((await other.html('/')).body);
  const before = readFileSync(data, 'utf8');
  const large = 'x'.repeat(10241);
  for (const [status, body, headers, message] of [
    [403, large, { origin: 'http://evil.example' }, /요청 출처가 이 서버가 아닙니다/],
    [413, large, { 'content-type': 'application/json' }, /폼 본문은 10KB를 넘을 수 없습니다/],
    [415, 'x'.repeat(10240), { 'content-type': 'application/json' }, /폼 본문 형식은/],
    [415, 'unknown=1', { 'content-type': 'application/json' }, /폼 본문 형식은/],
    [400, 'unknown=1', {}, /알 수 없는 매개변수입니다: unknown/],
    [403, 'amount=1000', {}, /폼 토큰이 맞지 않습니다/],
    [403, 'amount=1000&csrf=wrong', {}, /폼 토큰이 맞지 않습니다/],
    [403, `amount=abc&month=bad&csrf=${otherToken}`, {}, /폼 토큰이 맞지 않습니다/],
    [400, `amount=1000&month=bad&csrf=${csrf}`, {}, /--month는 YYYY-MM/],
  ]) {
    const response = await postForm(base, body, headers);
    assert.equal(response.status, status);
    assert.match(await response.text(), message);
  }
  const get = await html('/transactions', 405);
  assert.equal(get.headers.get('allow'), 'POST');
  assert.equal(readFileSync(data, 'utf8'), before);
  assert.deepEqual(cliJson('undo', '--list'), []);
});

test('길이를 알 수 없는 폼도 10240바이트를 넘는 즉시 응답한다', { timeout: 5000 }, async (t) => {
  const { base, cliJson, data } = await fixture(t);
  const before = readFileSync(data, 'utf8');
  const request = httpRequest(base + '/transactions', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  t.after(() => request.destroy());
  const replied = once(request, 'response');
  request.write('x'.repeat(10240));
  request.write('x');
  const [response] = await replied;
  assert.equal(response.statusCode, 413);
  assert.equal(response.headers.connection, 'close');
  response.resume();
  await once(response, 'end');
  assert.equal(readFileSync(data, 'utf8'), before);
  assert.deepEqual(cliJson('undo', '--list'), []);
});

test('웹 거래 입력이 유효해도 손상된 데이터 파일에는 저장하지 않는다', async (t) => {
  const { base, data, html } = await fixture(t);
  const csrf = formToken((await html('/')).body);
  const broken = '{깨진 JSON';
  writeFileSync(data, broken);
  const response = await postForm(base, new URLSearchParams({ amount: '1000', csrf }));
  assert.equal(response.status, 500);
  assert.match(await response.text(), /데이터 파일을 읽을 수 없습니다/);
  assert.equal(readFileSync(data, 'utf8'), broken);
});
