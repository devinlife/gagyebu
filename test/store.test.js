import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DataError } from '../src/errors.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES, readData, resolveDataPath, writeData } from '../src/store.js';
import { tempDir, writeJson } from './helpers.js';

test('데이터 경로는 옵션, 환경 변수, 기본값 순으로 정한다', (t) => {
  const home = tempDir(t);
  const env = { GAGYEBU_DATA: '~/env.json' };
  assert.equal(resolveDataPath('~/option.json', env, home), path.join(home, 'option.json'));
  assert.equal(resolveDataPath(undefined, env, home), path.join(home, 'env.json'));
  assert.equal(resolveDataPath('', env, home), path.join(home, 'env.json'));
  assert.equal(resolveDataPath(undefined, {}, home), path.join(home, '.gagyebu', 'data.json'));
  assert.equal(resolveDataPath('', { GAGYEBU_DATA: '' }, home), path.join(home, '.gagyebu', 'data.json'));
});

test('데이터 경로는 홈과 상대 경로를 절대 경로로 푼다', (t) => {
  const home = tempDir(t);
  assert.equal(resolveDataPath('~', {}, home), home);
  assert.equal(resolveDataPath('~/x/d.json', {}, home), path.join(home, 'x', 'd.json'));
  assert.equal(resolveDataPath('a/d.json', {}, home), path.resolve('a/d.json'));
  assert.equal(resolveDataPath('~user/d.json', {}, home), path.resolve('~user/d.json'));
  assert.equal(resolveDataPath(path.join(home, 'd.json'), {}, home), path.join(home, 'd.json'));
});

test('데이터 파일이 없으면 폴더나 파일을 만들지 않고 새 초기값을 돌려준다', (t) => {
  const directory = path.join(tempDir(t), 'missing');
  const filePath = path.join(directory, 'data.json');
  const first = readData(filePath);
  const second = readData(filePath);
  assert.deepEqual(first, {
    version: CURRENT_VERSION,
    nextId: 1,
    categories: {
      expense: ['식비', '교통', '주거', '통신', '생활', '의료', '문화', '기타'],
      income: ['급여', '용돈', '기타'],
    },
    budgets: {},
    transactions: [],
  });
  assert.deepEqual(second, first);
  assert.notEqual(first, second);
  assert.notEqual(first.transactions, second.transactions);
  assert.notEqual(first.budgets, second.budgets);
  assert.notEqual(first.categories, second.categories);
  for (const type of ['expense', 'income']) {
    assert.notEqual(first.categories[type], second.categories[type]);
    assert.notEqual(first.categories[type], DEFAULT_CATEGORIES[type]);
  }
  assert.equal(existsSync(directory), false);
  assert.equal(existsSync(filePath), false);
});

test('버전 1의 거래와 다음 번호를 보존하고 거래의 분류를 처음 나온 순서로 더한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const transactions = [
    { id: 1, type: 'expense', category: '커피' },
    { id: 2, type: 'income', category: '월급' },
    { id: 3, type: 'expense', category: '식비' },
    { id: 4, type: 'expense', category: '책' },
    { id: 5, type: 'expense', category: '커피' },
    { id: 6, type: 'transfer', category: '이체' },
    { id: 7, type: 'income', category: '' },
    { id: 8, type: 'expense', category: 3 },
  ];
  const original = JSON.stringify({ version: 1, nextId: 10, transactions });
  writeFileSync(filePath, original);

  assert.deepEqual(readData(filePath), {
    version: CURRENT_VERSION,
    nextId: 10,
    categories: {
      expense: [...DEFAULT_CATEGORIES.expense, '커피', '책'],
      income: [...DEFAULT_CATEGORIES.income, '월급'],
    },
    transactions,
    budgets: {},
  });
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('버전 2의 분류 목록이 잘못되면 데이터 오류를 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  for (const categories of [undefined, [], { expense: [], income: {} }, { expense: [1], income: [] }]) {
    writeJson(filePath, { version: CURRENT_VERSION, categories });
    assert.throws(() => readData(filePath), {
      constructor: DataError,
      message: `데이터 파일을 읽을 수 없습니다: ${filePath} (categories가 올바르지 않습니다)`,
    });
  }
});

test('버전 2에 예산이 없으면 빈 객체를 쓰고 등록된 예산은 그대로 읽는다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  for (const budgets of [undefined, { 식비: 12000, 교통: 30000 }]) {
    const original = JSON.stringify({ version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, budgets });
    writeFileSync(filePath, original);
    const data = readData(filePath);
    assert.equal(data.version, CURRENT_VERSION);
    assert.deepEqual(data.budgets, budgets ?? {});
    assert.equal(readFileSync(filePath, 'utf8'), original);
  }
});

test('버전 1과 2의 예산 형식이 잘못되면 데이터 오류를 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const invalidBudgets = [[], null, 1, ...[0, -1, 1.5, '1000', 2 ** 53].map((amount) => ({ 식비: amount }))];
  for (const version of [1, CURRENT_VERSION]) {
    for (const budgets of invalidBudgets) {
      writeJson(filePath, { version, categories: DEFAULT_CATEGORIES, budgets });
      assert.throws(() => readData(filePath), {
        constructor: DataError,
        message: `데이터 파일을 읽을 수 없습니다: ${filePath} (budgets가 올바르지 않습니다)`,
      });
    }
  }
});

test('깨진 JSON과 올바르지 않거나 지원하지 않는 버전을 처리 오류로 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  for (const [text, reason] of [
    ['{', 'JSON 형식이 잘못되었습니다'],
    ['null', 'version이 올바르지 않습니다: undefined'],
    ['[]', 'version이 올바르지 않습니다: undefined'],
    ['{"nextId":1}', 'version이 올바르지 않습니다: undefined'],
    ['{"version":"1"}', 'version이 올바르지 않습니다: 1'],
    ['{"version":1.5}', 'version이 올바르지 않습니다: 1.5'],
    ['{"version":0}', 'version이 올바르지 않습니다: 0'],
    ['{"version":{"toString":null}}', 'version이 올바르지 않습니다: {"toString":null}'],
    [JSON.stringify({ version: CURRENT_VERSION + 1 }), `지원하지 않는 version입니다: ${CURRENT_VERSION + 1}`],
  ]) {
    writeFileSync(filePath, text);
    assert.throws(() => readData(filePath), {
      constructor: DataError,
      message: `데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})`,
    });
  }
});

test('데이터 경로를 읽을 수 없으면 처리 오류로 보고한다', (t) => {
  const filePath = tempDir(t);
  assert.throws(() => readData(filePath), {
    constructor: DataError,
    message: `데이터 파일을 읽을 수 없습니다: ${filePath} (EISDIR)`,
  });
});

test('하위 폴더에 데이터를 쓰고 덮어써도 올바른 JSON 파일만 남는다', (t) => {
  const directory = path.join(tempDir(t), 'a', 'b');
  const filePath = path.join(directory, 'data.json');
  for (const data of [
    { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: 1, transactions: [] },
    { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: 2, transactions: [{ id: 1 }] },
  ]) {
    writeData(filePath, data);
    assert.deepEqual(readData(filePath), { ...data, budgets: {} });
    assert.equal(readFileSync(filePath, 'utf8'), JSON.stringify(data, null, 2) + '\n');
    assert.deepEqual(readdirSync(directory), ['data.json']);
  }
});

test('데이터 교체에 실패하면 처리 오류를 던지고 임시 파일을 정리한다', (t) => {
  const directory = tempDir(t);
  const filePath = path.join(directory, 'data.json');
  mkdirSync(filePath);
  const existingFile = path.join(filePath, 'keep');
  writeFileSync(existingFile, '원본');

  assert.throws(() => writeData(filePath, { version: CURRENT_VERSION }), {
    constructor: DataError,
    message: `데이터 파일을 쓸 수 없습니다: ${filePath} (EISDIR)`,
  });
  assert.deepEqual(readdirSync(directory), ['data.json']);
  assert.equal(readFileSync(existingFile, 'utf8'), '원본');
});

test('JSON으로 변환할 수 없으면 기존 데이터 파일을 보존한다', (t) => {
  const directory = tempDir(t);
  const filePath = path.join(directory, 'data.json');
  const data = { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: 1, transactions: [] };
  writeData(filePath, data);

  assert.throws(() => writeData(filePath, undefined), {
    constructor: DataError,
    message: `데이터 파일을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`,
  });
  assert.deepEqual(readData(filePath), { ...data, budgets: {} });
  assert.deepEqual(readdirSync(directory), ['data.json']);
});

test('새 데이터 파일은 소유자만 접근할 수 있고 덮어쓸 때 기존 권한을 보존한다',
  { skip: process.platform === 'win32' }, (t) => {
    const filePath = path.join(tempDir(t), 'data.json');
    const data = { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: 1, transactions: [] };
    writeData(filePath, data);
    assert.equal(statSync(filePath).mode & 0o077, 0);

    for (const mode of [0o640, 0o600]) {
      chmodSync(filePath, mode);
      writeData(filePath, data);
      assert.equal(statSync(filePath).mode & 0o777, mode);
    }
  });

test('예상하지 못한 직렬화 오류는 원래 오류로 전파하고 기존 데이터를 보존한다', (t) => {
  const directory = tempDir(t);
  const filePath = path.join(directory, 'data.json');
  const data = { version: CURRENT_VERSION, categories: DEFAULT_CATEGORIES, nextId: 1, transactions: [] };
  writeData(filePath, data);

  assert.throws(() => writeData(filePath, { version: CURRENT_VERSION, amount: 1n }), TypeError);
  assert.deepEqual(readData(filePath), { ...data, budgets: {} });
  assert.deepEqual(readdirSync(directory), ['data.json']);
});
