import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertUsageError, runCli, tempDir, testEnv, writeJson } from './helpers.js';

const usage = '사용법: gagyebu search <글> [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--tag <태그>] [--json] [--data <경로>]';

const meal = {
  id: 1, date: '2026-02-10', type: 'expense', amount: 1000, category: '식비',
  memo: 'coupon 사용', account: '현금', tags: ['회식', '법인'],
};
const income = {
  id: 2, date: '2026-02-09', type: 'income', amount: 2000, category: '쿠폰지원',
  memo: 'COUPON 정산', account: '현금',
};

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-search-');

  const data = path.join(directory, 'data.json');
  writeJson(data, { version: 1, nextId: 3, transactions: [meal, income] });

  function run(command, ...args) {
    return runCli([command, '--data', data, ...args], { env: testEnv(directory) });
  }

  return { data, run };
}

function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

test('메모, 분류와 태그에서 대소문자를 무시해 부분 일치하는 거래를 찾는다', (t) => {
  const { run } = fixture(t);
  for (const [query, expected] of [
    ['COUPON', [{ ...income, tags: [] }, meal]],
    ['  COUPON  ', []],
    [' 사용', [meal]],
    ['사용 ', []],
    ['oupo', [{ ...income, tags: [] }, meal]],
    ['폰지', [{ ...income, tags: [] }]],
    ['회식', [meal]],
    ['#회식', [meal]],
    ['#회', [meal]],
  ]) {
    assert.deepEqual(JSON.parse(output(run('search', query, '--json'))), expected, query);
  }
});

test('검색에 목록 필터를 적용하고 목록과 같은 표와 합계를 출력한다', (t) => {
  const { run } = fixture(t);
  const filters = ['--type', 'expense', '--tag', ' #법인,회식 ', '--tag', '법인'];
  assert.deepEqual(JSON.parse(output(run('search', 'coupon', ...filters, '--json'))), [meal]);
  assert.equal(output(run('search', 'coupon', ...filters)), output(run('list', ...filters)));
  assert.equal(output(run('search', 'coupon', '--type', 'income', '--tag', '법인')), '거래가 없습니다.\n');
  assert.equal(output(run('search', 'x', '--json')), '[]\n');
});

test('검색 글과 옵션의 사용법 오류를 데이터 읽기 전에 보고한다', (t) => {
  const { data, run } = fixture(t);
  const saved = '{깨진 JSON';
  writeFileSync(data, saved);

  for (const [args, message] of [
    [[], '검색할 글이 없습니다'],
    [[''], '검색할 글이 비었습니다'],
    [['  '], '검색할 글이 비었습니다'],
    [['a', 'b'], '예상하지 않은 인자입니다: b'],
    [['a', '--nope'], '알 수 없는 옵션입니다: --nope'],
    [['a', '--tag'], '--tag 값이 없습니다'],
    [['a', '--tag', 'a b'], '태그는 공백 없는 1~20자여야 합니다: a b'],
    [['a', '--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
  ]) {
    assertUsageError(run('search', ...args), message, usage);
    assert.equal(readFileSync(data, 'utf8'), saved);
  }
});

test('search --help는 검색 글 없이도 사용법 한 줄을 출력한다', (t) => {
  const { run } = fixture(t);
  assert.equal(output(run('search', '--help')), `${usage}\n`);
});
