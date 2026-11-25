import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CATEGORIES } from '../src/store.js';

const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));
const usage = '사용법: gagyebu budget set|list|rm [인자] [--옵션 값]';
const usages = {
  set: '사용법: gagyebu budget set <분류> <금액> [--data <경로>]',
  list: '사용법: gagyebu budget list [--json] [--data <경로>]',
  rm: '사용법: gagyebu budget rm <분류> [--data <경로>]',
};

function fixture(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gagyebu-budget-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const data = path.join(directory, 'data.json');
  const env = { ...process.env, GAGYEBU_DATA: path.join(directory, 'env.json'), GAGYEBU_TODAY: '2026-03-01' };

  function run(...args) {
    const result = spawnSync(process.execPath, [binPath, 'budget', ...args], { encoding: 'utf8', env });
    assert.ifError(result.error);
    return result;
  }

  function write(budgets, transactions = []) {
    const original = JSON.stringify({
      version: 2, nextId: transactions.length + 1, categories: DEFAULT_CATEGORIES, budgets, transactions,
    });
    writeFileSync(data, original);
    return original;
  }

  return { directory, data, run, write };
}

function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

function assertError({ status, stdout, stderr }, expectedStatus, expectedText) {
  assert.equal(status, expectedStatus, stderr);
  assert.equal(stdout, '');
  assert.equal(stderr, expectedText);
}

test('지출 분류의 월 예산을 설정하고 새 금액으로 덮어쓴다', (t) => {
  const { directory, data, run } = fixture(t);
  assert.equal(output(run('set', ' 식비 ', '1만2천', '--data', data)), '설정했습니다: 식비 월 12,000원\n');
  assert.deepEqual(JSON.parse(readFileSync(data, 'utf8')).budgets, { 식비: 12000 });
  assert.equal(output(run('set', '식비', '30,000원', '--data', data)), '설정했습니다: 식비 월 30,000원\n');
  assert.deepEqual(JSON.parse(readFileSync(data, 'utf8')).budgets, { 식비: 30000 });
  assert.deepEqual(readdirSync(directory), ['data.json']);
});

test('등록되지 않은 분류와 수입 분류에는 예산을 설정할 수 없다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write({ 식비: 12000 });
  for (const name of ['미등록', '급여']) {
    assertError(run('set', name, '1000', '--data', data), 1, `오류: 없는 분류입니다: ${name}\n`);
    assert.equal(readFileSync(data, 'utf8'), original);
  }
});

test('이번 달 지출만 합산하고 사용률과 분류 이름 순으로 예산을 보여 준다', (t) => {
  const { data, run, write } = fixture(t);
  const transactions = [
    ['2026-03-01', 'expense', '식비', 9000],
    ['2026-03-02', 'expense', '식비', 6000],
    ['2026-02-28', 'expense', '식비', 20000],
    ['2026-04-01', 'expense', '식비', 20000],
    ['2026-03-03', 'income', '식비', 20000],
    ['2026-03-04', 'transfer', '식비', 20000],
    ['2026-03-05', 'expense', '교통', 6000],
    ['2026-03-06', 'expense', '문화', 12000],
    ['2026-03-07', 'expense', '생활', 5000],
  ].map(([date, type, category, amount]) => ({ date, type, category, amount }));
  const original = write({ 문화: 24000, 식비: 12000, 교통: 12000, 의료: 5000 }, transactions);

  assert.deepEqual(JSON.parse(output(run('list', '--data', data, '--json'))), {
    month: '2026-03',
    budgets: [
      { category: '식비', budget: 12000, spent: 15000, ratio: 1.25, remaining: -3000 },
      { category: '교통', budget: 12000, spent: 6000, ratio: 0.5, remaining: 6000 },
      { category: '문화', budget: 24000, spent: 12000, ratio: 0.5, remaining: 12000 },
      { category: '의료', budget: 5000, spent: 0, ratio: 0, remaining: 5000 },
    ],
  });
  assert.equal(output(run('list', '--data', data)), [
    '분류      예산      사용  사용률      남음',
    '식비  12,000원  15,000원  125.0%  -3,000원',
    '교통  12,000원   6,000원   50.0%   6,000원',
    '문화  24,000원  12,000원   50.0%  12,000원',
    '의료   5,000원       0원    0.0%   5,000원',
    '',
  ].join('\n'));
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('예산이 없으면 안내나 빈 JSON을 보여 주고 파일을 만들지 않는다', (t) => {
  const { directory, run } = fixture(t);
  assert.equal(output(run('list')), '설정한 예산이 없습니다.\n');
  assert.deepEqual(JSON.parse(output(run('list', '--json'))), { month: '2026-03', budgets: [] });
  assert.deepEqual(readdirSync(directory), []);
});

test('설정한 예산만 지우고 없는 예산을 지우려 하면 파일을 보존한다', (t) => {
  const { data, run, write } = fixture(t);
  write({ 식비: 12000, 교통: 30000 });
  assert.equal(output(run('rm', ' 식비 ', '--data', data)), '예산을 지웠습니다: 식비\n');
  const saved = readFileSync(data, 'utf8');
  assert.deepEqual(JSON.parse(saved).budgets, { 교통: 30000 });
  assertError(run('rm', '식비', '--data', data), 1, '오류: 예산이 없는 분류입니다: 식비\n');
  assert.equal(readFileSync(data, 'utf8'), saved);
});

test('예산 명령의 사용법 오류는 종료 코드 2와 해당 사용법을 출력한다', (t) => {
  const { directory, run } = fixture(t);
  const cases = [
    [[], '예산 하위 명령이 없습니다', usage],
    [['unknown'], '알 수 없는 예산 하위 명령 unknown', usage],
    [['set'], '분류 이름이 없습니다', usages.set],
    [['set', '식비'], '금액이 없습니다', usages.set],
    [['set', '식비', '1000', 'extra'], '예상하지 않은 인자 extra', usages.set],
    [['set', '식비', '0'], '금액은 양의 정수여야 합니다: 0', usages.set],
    [['list', 'extra'], '예상하지 않은 인자 extra', usages.list],
    [['rm'], '분류 이름이 없습니다', usages.rm],
    [['rm', '식비', 'extra'], '예상하지 않은 인자 extra', usages.rm],
  ];
  for (const [command, args] of [['set', ['식비', '1000']], ['list', []], ['rm', ['식비']]]) {
    cases.push(
      [[command, ...args, '--nope'], '알 수 없는 옵션 --nope', usages[command]],
      [[command, ...args, '--data'], '--data 값이 없습니다', usages[command]],
      [[command, ...args, '--data', ''], '--data 값이 비었습니다', usages[command]],
    );
  }
  for (const [args, message, expectedUsage] of cases) {
    assertError(run(...args), 2, `오류: ${message}\n${expectedUsage}\n`);
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('예산 도움말과 하위 명령 도움말은 데이터 파일 없이 사용법을 출력한다', (t) => {
  const { run } = fixture(t);
  assert.equal(output(run('--help')), Object.values(usages).join('\n') + '\n');
  for (const [command, expected] of Object.entries(usages)) {
    assert.equal(output(run(command, '--help')), expected + '\n');
  }
});
