import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { displayWidth } from '../src/format.js';
import { runCli, tempDir, testEnv, writeJson } from './helpers.js';

const usage = '사용법: gagyebu list [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--type expense|income] [--category <분류>] [--tag <태그>] [--json] [--data <경로>]';

const sameDayIncome = {
  id: 10, date: '2026-02-10', type: 'income', amount: 1234567, category: '월급',
  memo: '', account: '현금', tags: ['정기'],
};
const first = {
  id: 12, date: '2026-02-01', type: 'expense', amount: 1200, category: '식비',
  memo: '아침', account: '현금', tags: [],
};
const sameDayExpense = {
  id: 2, date: '2026-02-10', type: 'expense', amount: 50, category: '식비',
  memo: '점심 2인', account: '현금', tags: [],
};
const last = {
  id: 4, date: '2026-02-28', type: 'expense', amount: 1000, category: '식비권',
  memo: 'coupon', account: '현금', tags: [],
};
const transactions = [sameDayIncome, last, first, sameDayExpense];

function fixture(t, envOverrides = {}) {
  const directory = tempDir(t, 'gagyebu-list-');

  const data = path.join(directory, 'data.json');
  const env = testEnv(directory, { GAGYEBU_DATA: path.join(directory, 'env.json'), ...envOverrides });

  function run(...args) {
    return runCli(['list', '--data', data, ...args], { env });
  }

  function write(entries = transactions) {
    return writeJson(data, { version: 1, nextId: 13, transactions: entries });
  }

  return { directory, data, run, write };
}

function assertOutput({ status, stdout, stderr }, expected) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(stdout, expected);
}

function readJson({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}

test('JSON은 날짜와 번호 순으로 저장 객체를 그대로 출력한다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write();

  assert.deepEqual(readJson(run('--json')), [first, sameDayExpense, sameDayIncome, last]);
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('날짜 경계를 포함하고 구분과 분류 필터를 조합한다', (t) => {
  const { run, write } = fixture(t);
  write();

  for (const [args, ids] of [
    [['--from', '2026-02-10'], [2, 10, 4]],
    [['--to', '2026-02-10'], [12, 2, 10]],
    [['--from', '2026-02-10', '--to', '2026-02-10'], [2, 10]],
    [['--type', 'income'], [10]],
    [['--category', '식비'], [12, 2]],
    [['--from', '2026-02-10', '--to', '2026-02-28', '--type', 'expense', '--category', '식비'], [2]],
  ]) {
    const entries = readJson(run('--json', ...args));
    assert.deepEqual(entries.map(({ id }) => id), ids, args.join(' '));
  }
  assert.deepEqual(readJson(run('--json', '--category', '식비')), [first, sameDayExpense]);
  assertOutput(run('--category', '교통비'), '거래가 없습니다.\n');
  assertOutput(run('--category', '교통비', '--json'), '[]\n');
});

test('연도를 생략한 날짜와 상대 날짜로 거래를 거른다', (t) => {
  const { run, write } = fixture(t, { GAGYEBU_TODAY: '2026-02-10' });
  const previousDay = { ...first, id: 11, date: '2026-02-09' };
  write([...transactions, previousDay]);

  const exact = readJson(run('--json', '--from', '2026-02-10', '--to', '2026-02-10'));
  const short = readJson(run('--json', '--from', '02-10', '--to', '2/10'));
  assert.deepEqual(short.map(({ id }) => id), exact.map(({ id }) => id));
  const relative = readJson(run('--json', '--from', '어제', '--to', '오늘'));
  assert.deepEqual(relative.map(({ id }) => id), [11, 2, 10]);
});

test('표는 한글 폭을 맞추고 번호와 금액을 오른쪽에 놓는다', (t) => {
  const { run, write } = fixture(t);
  write();

  const result = run();
  assertOutput(result, [
    '번호  날짜        구분         금액  분류    메모',
    '  12  2026-02-01  지출      1,200원  식비    아침',
    '   2  2026-02-10  지출         50원  식비    점심 2인',
    '  10  2026-02-10  수입  1,234,567원  월급    #정기',
    '   4  2026-02-28  지출      1,000원  식비권  coupon',
    '4건, 수입 1,234,567원, 지출 2,250원',
    '',
  ].join('\n'));
  const tableLines = result.stdout.split('\n').slice(0, 5);
  const categoryCells = ['분류', '식비', '식비', '월급', '식비권'];
  assert.deepEqual(tableLines.map((line, index) =>
    displayWidth(line.slice(0, line.indexOf(categoryCells[index])))), [37, 37, 37, 37, 37]);
});

test('합계는 필터에 남은 거래만 더한다', (t) => {
  const { run, write } = fixture(t);
  write();

  const result = run('--type', 'expense');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.split('\n').at(-2), '3건, 수입 0원, 지출 2,250원');
});

test('데이터 파일이 없거나 거래가 비어 있으면 빈 목록을 출력한다', (t) => {
  const { directory, run, write } = fixture(t);
  assertOutput(run(), '거래가 없습니다.\n');
  assertOutput(run('--json'), '[]\n');
  assert.deepEqual(readdirSync(directory), []);

  write([]);
  assertOutput(run(), '거래가 없습니다.\n');
  assertOutput(run('--json'), '[]\n');
});

test('사용법 오류는 데이터 읽기 전에 종료 코드 2와 함께 출력한다', (t) => {
  const { data, run } = fixture(t, { GAGYEBU_TODAY: '2026-02-10' });
  const original = '{깨진 JSON';
  writeFileSync(data, original);

  for (const [args, message] of [
    [['--from', '2026-02-30'], '--from은 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-30'],
    [['--to', '2026-1-5'], '--to는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-1-5'],
    [['--to', '2026-02-29'], '--to는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-29'],
    [['--from', '내일'], '--from은 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 내일'],
    [['--from', '2026-03-01', '--to', '2026-02-01'], '--from이 --to보다 늦습니다: 2026-03-01 > 2026-02-01'],
    [['--from', '오늘', '--to', '어제'], '--from이 --to보다 늦습니다: 2026-02-10 > 2026-02-09'],
    [['--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
    [['--nope'], '알 수 없는 옵션 --nope'],
    [['x'], '예상하지 않은 인자 x'],
    [['--json=1'], '--json은 값을 받지 않습니다'],
    [['--help=1'], '--help은 값을 받지 않습니다'],
    [['--category='], '--category 값이 비었습니다'],
    [['--data='], '--data 값이 비었습니다'],
    [['--tag='], '태그는 공백 없는 1~20자여야 합니다: '],
    [['--tag', 'a b'], '태그는 공백 없는 1~20자여야 합니다: a b'],
    ...['from', 'to', 'type', 'category', 'tag', 'data'].map((option) => [[`--${option}`], `--${option} 값이 없습니다`]),
  ]) {
    const { status, stdout, stderr } = run(...args);
    const invocation = args.join(' ');
    assert.equal(status, 2, invocation);
    assert.equal(stdout, '', invocation);
    assert.equal(stderr, `오류: ${message}\n${usage}\n`, invocation);
  }
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('깨진 JSON과 잘못된 거래 목록은 종료 코드 1을 반환한다', (t) => {
  const { data, run } = fixture(t);
  for (const [original, reason] of [
    ['{깨진 JSON', 'JSON 형식이 잘못되었습니다'],
    [JSON.stringify({ version: 1, nextId: 1, transactions: {} }), 'transactions가 올바르지 않습니다'],
  ]) {
    writeFileSync(data, original);
    const { status, stdout, stderr } = run();
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${data} (${reason})\n`);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('list --help는 사용법 한 줄을 출력한다', (t) => {
  const { run } = fixture(t);
  assertOutput(run('--help'), `${usage}\n`);
});

test('각 태그를 정규화하고 모두 가진 거래만 다른 필터와 함께 고른다', (t) => {
  const { run, write } = fixture(t);
  const regular = { ...sameDayExpense, tags: ['정기', '회식'] };
  const oneTime = { ...last, tags: ['회식'] };
  write([sameDayIncome, oneTime, first, regular]);

  for (const [args, expected] of [
    [['--tag', ' #정기 '], [regular, sameDayIncome]],
    [['--tag', '정기', '--tag=회식'], [regular]],
    [['--tag', '정기,회식,정기'], [regular]],
    [['--tag', '정기', '--type', 'expense', '--from', '2026-02-10'], [regular]],
    [['--tag', '정기', '--type', 'expense', '--from', '2026-02-11'], []],
  ]) {
    assert.deepEqual(readJson(run('--json', ...args)), expected);
  }
});

test('메모 뒤에 태그를 붙이고 옛 거래의 메모 시작 칸을 유지한다', (t) => {
  const { run, write } = fixture(t);
  const { tags, ...legacy } = first;
  const tagged = { ...sameDayExpense, tags: ['회식', '법인'] };
  write([legacy, last, tagged]);

  const { status, stdout, stderr } = run();
  assert.equal(status, 0, stderr);
  const cells = ['메모', '아침', '점심 2인 #회식 #법인', 'coupon'];
  const lines = stdout.split('\n').slice(0, cells.length);
  assert.deepEqual(lines.map((line, index) => line.slice(-cells[index].length)), cells);
  const offsets = lines.map((line, index) => displayWidth(line.slice(0, -cells[index].length)));
  assert.deepEqual(offsets, Array(cells.length).fill(offsets[0]));
  assert.deepEqual(readJson(run('--json', '--tag', '회식')), [tagged]);
});
