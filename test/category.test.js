import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { addCategory, listCategories, removeCategory } from '../src/category.js';
import { DataError } from '../src/errors.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES } from '../src/store.js';
import { assertUsageError, readJson, runCli, tempDir, testEnv, writeJson, transaction } from './helpers.js';

const usage = '사용법: gagyebu category list|add|rm [인자] [--옵션 값]';
const usages = {
  list: '사용법: gagyebu category list [--type expense|income] [--json] [--data <경로>]',
  add: '사용법: gagyebu category add <이름> [--type expense|income] [--data <경로>]',
  rm: '사용법: gagyebu category rm <이름> [--type expense|income] [--data <경로>]',
};

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-category-');
  const data = path.join(directory, 'data.json');
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-03-01' });

  function runCommand(...args) {
    return runCli([...args], { env });
  }

  return {
    data,
    directory,
    runCli: runCommand,
    run: (...args) => runCommand('category', ...args),
    read: () => readJson(data),
  };
}

function assertOutput({ status, stdout, stderr }, expected) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(stdout, expected);
}

function assertError({ status, stdout, stderr }, expectedStatus, expectedText) {
  assert.equal(status, expectedStatus, stderr);
  assert.equal(stdout, '');
  assert.equal(stderr, expectedText);
}

test('빈 데이터의 기본 분류를 등록 순서대로 보여 주고 파일을 만들지 않는다', (t) => {
  const { directory, run } = fixture(t);
  const rows = {
    expense: DEFAULT_CATEGORIES.expense.map((name) => `지출 ${name} 0건`),
    income: DEFAULT_CATEGORIES.income.map((name) => `수입 ${name} 0건`),
  };
  for (const [args, expected] of [
    [[], [...rows.expense, ...rows.income]],
    [['--type', 'income'], rows.income],
  ]) {
    const { status, stdout, stderr } = run('list', ...args);
    assert.equal(status, 0, stderr);
    assert.equal(stderr, '');
    assert.deepEqual(
      stdout.trimEnd().split('\n').map((line) => line.replace(/ +/g, ' ')),
      ['구분 분류 거래', ...expected],
    );
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('지출 분류에 예산이 있으면 예산을 지운 뒤에만 분류를 지울 수 있다', (t) => {
  const { data, run, runCli, read } = fixture(t);
  const original = JSON.stringify({
    version: CURRENT_VERSION, nextId: 1, categories: DEFAULT_CATEGORIES, budgets: { 식비: 12000, 기타: 30000 },
    transactions: [],
  });
  writeFileSync(data, original);

  assertError(run('rm', '식비'), 1, '오류: 예산이 있는 분류입니다: 식비\n');
  assert.equal(readFileSync(data, 'utf8'), original);
  assertOutput(run('rm', '기타', '--type', 'income'), '분류를 지웠습니다: 수입 기타\n');
  assertOutput(runCli('budget', 'rm', '식비'), '예산을 지웠습니다: 식비\n');
  assertOutput(run('rm', '식비'), '분류를 지웠습니다: 지출 식비\n');
  assert.ok(!read().categories.expense.includes('식비'));
  assert.deepEqual(read().budgets, { 기타: 30000 });
});

test('분류의 거래 수를 구분별로 세고 버전 1 파일은 그대로 둔다', (t) => {
  const { data, run } = fixture(t);
  const transactions = [
    transaction({ id: 1, type: 'expense', category: '기타' }),
    transaction({ id: 2, type: 'expense', category: '기타' }),
    transaction({ id: 3, type: 'income', category: '기타' }),
    transaction({ id: 4, type: 'expense', category: '커피' }),
  ];
  const original = JSON.stringify({ version: 1, nextId: 5, transactions });
  writeFileSync(data, original);

  const expected = {
    expense: [
      ...DEFAULT_CATEGORIES.expense.map((name) => ({ name, count: name === '기타' ? 2 : 0 })),
      { name: '커피', count: 1 },
    ],
    income: DEFAULT_CATEGORIES.income.map((name) => ({ name, count: name === '기타' ? 1 : 0 })),
  };
  for (const [args, list] of [
    [[], expected],
    [['--type', 'income'], { income: expected.income }],
  ]) {
    const { status, stdout, stderr } = run('list', '--json', ...args);
    assert.equal(status, 0, stderr);
    assert.equal(stderr, '');
    assert.deepEqual(JSON.parse(stdout), list);
  }
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('분류를 등록 순서 끝에 더하고 거래에 쓸 수 있게 한다', (t) => {
  const { data, run, runCli, read } = fixture(t);
  writeJson(data, { version: 1, nextId: 1, transactions: [] });

  assertOutput(run('add', '  커피  '), '분류를 더했습니다: 지출 커피\n');
  assert.deepEqual(read(), {
    version: CURRENT_VERSION,
    budgets: {},
    nextId: 1,
    categories: { ...DEFAULT_CATEGORIES, expense: [...DEFAULT_CATEGORIES.expense, '커피'] },
    transactions: [],
  });
  assertOutput(run('add', '커피', '--type', 'income'), '분류를 더했습니다: 수입 커피\n');
  assert.deepEqual(read().categories.income, [...DEFAULT_CATEGORIES.income, '커피']);
  assertOutput(runCli('add', '1000', '--category', '커피'),
    '추가했습니다: #1 2026-03-01 지출 1,000원 커피\n');
  assert.equal(read().transactions[0].category, '커피');
});

test('이미 있는 분류를 다시 더하면 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const original = JSON.stringify({ version: 1, nextId: 1, transactions: [] });
  writeFileSync(data, original);

  assertError(run('add', '  식비  '), 1, '오류: 이미 있는 분류입니다: 식비\n');
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('이름 길이는 공백을 뺀 코드 포인트 수로 센다', (t) => {
  const { run, read } = fixture(t);
  const name = '🍎'.repeat(20);
  assertOutput(run('add', ` ${name} `), `분류를 더했습니다: 지출 ${name}\n`);
  assert.equal(read().categories.expense.at(-1), name);
  assertOutput(run('rm', ` ${name} `), `분류를 지웠습니다: 지출 ${name}\n`);
  assert.deepEqual(read().categories, DEFAULT_CATEGORIES);
});

test('쓰는 거래가 있거나 없는 분류를 지우려 하면 파일을 보존한다', (t) => {
  const { data, run } = fixture(t);
  const transactions = [
    transaction({ id: 1, type: 'expense', category: '식비' }),
    transaction({ id: 2, type: 'expense', category: '식비' }),
  ];
  const original = JSON.stringify({ version: 1, nextId: 3, transactions });
  writeFileSync(data, original);

  assertError(run('rm', '식비'), 1, '오류: 2건의 거래가 쓰는 분류입니다: 식비\n');
  assert.equal(readFileSync(data, 'utf8'), original);
  assertError(run('rm', '커피'), 1, '오류: 없는 분류입니다: 커피\n');
  assert.equal(readFileSync(data, 'utf8'), original);
});

test('같은 이름을 다른 구분에서 쓰는 거래는 분류 삭제를 막지 않는다', (t) => {
  const { data, run, runCli, read } = fixture(t);
  const transactions = [transaction({ id: 1, type: 'income', category: '기타' })];
  writeJson(data, { version: 1, nextId: 2, transactions });

  assertOutput(run('rm', '  기타  '), '분류를 지웠습니다: 지출 기타\n');
  assert.deepEqual(read(), {
    version: CURRENT_VERSION,
    budgets: {},
    nextId: 2,
    categories: { ...DEFAULT_CATEGORIES, expense: DEFAULT_CATEGORIES.expense.slice(0, -1) },
    transactions,
  });
  assertError(runCli('add', '1000'), 1,
    '오류: 없는 분류입니다: 기타 (gagyebu category add로 더하세요)\n');
  assertError(run('rm', '기타', '--type', 'income'), 1, '오류: 1건의 거래가 쓰는 분류입니다: 기타\n');
  assertOutput(run('rm', '급여', '--type', 'income'), '분류를 지웠습니다: 수입 급여\n');
  assert.deepEqual(read().categories.income, ['용돈', '기타']);
});

test('잘못된 하위 명령과 옵션 및 인자를 사용법 오류로 보고한다', (t) => {
  const { directory, run } = fixture(t);
  assertUsageError(run(), '분류 하위 명령이 없습니다', usage);
  assertUsageError(run('constructor'), '알 수 없는 분류 하위 명령입니다: constructor', usage);
  assertUsageError(run('--help', 'extra'), '예상하지 않은 인자입니다: extra', usage);
  assertUsageError(run('--help', '--nope'), '알 수 없는 옵션입니다: --nope', usage);
  assertUsageError(run('list', '남는값'), '예상하지 않은 인자입니다: 남는값', usages.list);

  for (const [command, subUsage] of Object.entries(usages)) {
    const operands = command === 'list' ? [] : ['식비'];
    for (const [args, message] of [
      [['--nope'], '알 수 없는 옵션입니다: --nope'],
      [['--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
      [['--type'], '--type 값이 없습니다'],
      [['--data'], '--data 값이 없습니다'],
      [['--data', ''], '--data 값이 비었습니다'],
    ]) {
      assertUsageError(run(command, ...operands, ...args), message, subUsage);
    }
  }

  for (const command of ['add', 'rm']) {
    const subUsage = usages[command];
    assertUsageError(run(command), '분류 이름이 없습니다', subUsage);
    assertUsageError(run(command, '식비', '남는값'), '예상하지 않은 인자입니다: 남는값', subUsage);
    assertUsageError(run(command, '식비', '--json'), '알 수 없는 옵션입니다: --json', subUsage);
    for (const invalid of ['', '   ', '가'.repeat(21)]) {
      assertUsageError(run(command, invalid),
        `분류 이름은 앞뒤 공백을 뺀 1~20자여야 합니다: ${invalid}`, subUsage);
    }
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('category와 하위 명령의 도움말은 사용법을 출력한다', (t) => {
  const { directory, run } = fixture(t);
  assertOutput(run('--help'), `${Object.values(usages).join('\n')}\n`);
  for (const [command, subUsage] of Object.entries(usages)) {
    assertOutput(run(command, '--help'), `${subUsage}\n`);
  }
  assert.deepEqual(readdirSync(directory), []);
});

test('공용 분류 목록은 등록 순서와 같은 구분의 거래 건수를 돌려준다', () => {
  const categories = Object.freeze({ expense: Object.freeze(['기타', '식비']), income: Object.freeze(['기타']) });
  const transactions = Object.freeze([
    transaction({ id: 1, category: '기타' }),
    transaction({ id: 2, category: '기타', type: 'income' }),
    transaction({ id: 3, category: '기타', type: 'transfer' }),
    transaction({ id: 4, category: '미등록' }),
  ].map(Object.freeze));
  const data = Object.freeze({ categories, transactions });

  assert.deepEqual(listCategories(data), {
    expense: [{ name: '기타', count: 1 }, { name: '식비', count: 0 }],
    income: [{ name: '기타', count: 1 }],
  });
  assert.deepEqual(listCategories(data, 'income'), { income: [{ name: '기타', count: 1 }] });
});

test('공용 분류 추가는 원본을 보존하고 같은 구분에서 중복을 거부한다', () => {
  const categories = Object.freeze({ expense: Object.freeze(['식비']), income: Object.freeze(['기타']) });
  assert.deepEqual(addCategory(categories, 'expense', '기타'), { expense: ['식비', '기타'], income: ['기타'] });
  assert.throws(() => addCategory(categories, 'income', '기타'), {
    constructor: DataError, message: '이미 있는 분류입니다: 기타',
  });
  assert.deepEqual(categories.expense, ['식비']);
});

test('공용 분류 삭제는 등록, 거래, 예산을 순서대로 검사하며 원본을 보존한다', () => {
  const categories = Object.freeze({ expense: Object.freeze(['식비', '교통']), income: Object.freeze(['식비']) });
  const data = Object.freeze({
    categories,
    transactions: Object.freeze([transaction({ id: 1, category: '식비' })]),
    budgets: Object.freeze({ 식비: 1000, 교통: 2000 }),
  });

  assert.throws(() => removeCategory(data, 'expense', '기타'), {
    constructor: DataError, message: '없는 분류입니다: 기타',
  });
  assert.throws(() => removeCategory(data, 'expense', '식비'), {
    constructor: DataError, message: '1건의 거래가 쓰는 분류입니다: 식비',
  });
  assert.throws(() => removeCategory(data, 'expense', '교통'), {
    constructor: DataError, message: '예산이 있는 분류입니다: 교통',
  });
  assert.deepEqual(removeCategory(data, 'income', '식비'), { expense: ['식비', '교통'], income: [] });
  assert.deepEqual(categories.income, ['식비']);
});
