import assert from 'node:assert/strict';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { DataError, UsageError } from '../src/errors.js';
import { CURRENT_VERSION, DEFAULT_CATEGORIES, loadData, MIGRATIONS, readBackup, readData, resolveDataPath, writeData } from '../src/store.js';
import { runCli, tempDir, testEnv, writeJson, transaction, currentData } from './helpers.js';

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
    accounts: [{ name: '현금', opening: 0 }],
    transactions: [],
    recurring: [],
    nextRecurringId: 1,
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
    transaction({ id: 1, type: 'expense', category: '커피', account: '카드' }),
    transaction({ id: 2, type: 'income', category: '월급' }),
    transaction({ id: 3, type: 'expense', category: '식비' }),
    transaction({ id: 4, type: 'expense', category: '책' }),
    transaction({ id: 5, type: 'expense', category: '커피' }),
    transaction({ id: 6, type: 'transfer', category: '', toAccount: '통장' }),
    transaction({ id: 7, type: 'income', category: '' }),
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
    recurring: [],
    nextRecurringId: 1,
    budgets: {},
    accounts: [{ name: '현금', opening: 0 }, { name: '카드', opening: 0 }, { name: '통장', opening: 0 }],
  });
  assert.equal(readFileSync(filePath, 'utf8'), original);
  const invalidCategory = transaction({ id: 8, category: 3 });
  const migrated = MIGRATIONS[1]({ transactions: [...transactions, invalidCategory] });
  assert.deepEqual(migrated.categories, readData(filePath).categories);
});

test('버전 2의 분류 목록이 잘못되면 데이터 오류를 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  for (const categories of [undefined, [], { expense: [], income: {} }, { expense: [1], income: [] }]) {
    writeJson(filePath, { version: 2, categories });
    assert.throws(() => readData(filePath), {
      constructor: DataError,
      message: `데이터 파일을 읽을 수 없습니다: ${filePath} (categories가 올바르지 않습니다)`,
    });
  }
});

test('버전 2에 예산이 없으면 빈 객체를 쓰고 등록된 예산은 그대로 읽는다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  for (const budgets of [undefined, { 식비: 12000, 교통: 30000 }]) {
    const original = JSON.stringify({ version: 2, categories: DEFAULT_CATEGORIES, budgets, transactions: [] });
    writeFileSync(filePath, original);
    const data = readData(filePath);
    assert.equal(data.version, CURRENT_VERSION);
    assert.deepEqual(data.budgets, budgets ?? {});
    assert.deepEqual(data.accounts, [{ name: '현금', opening: 0 }]);
    assert.equal(readFileSync(filePath, 'utf8'), original);
  }
});

test('버전 1과 2의 예산 형식이 잘못되면 데이터 오류를 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const invalidBudgets = [[], null, 1, ...[0, -1, 1.5, '1000', 2 ** 53].map((amount) => ({ 식비: amount }))];
  for (const version of [1, 2]) {
    for (const budgets of invalidBudgets) {
      writeJson(filePath, { version, categories: DEFAULT_CATEGORIES, budgets });
      assert.throws(() => readData(filePath), {
        constructor: DataError,
        message: `데이터 파일을 읽을 수 없습니다: ${filePath} (budgets가 올바르지 않습니다)`,
      });
    }
  }
});

test('버전 2의 계좌를 처음 나온 순서로 올리고 원본을 보존한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const transactions = ['카드', '현금', '통장', '카드', ''].map((account, index) =>
    transaction({ id: index + 1, account }));
  const categories = { expense: ['식비'], income: ['급여'] };
  const budgets = { 식비: 12000 };
  const data = { version: 2, nextId: 6, categories, budgets, transactions };
  const original = writeJson(filePath, data);

  assert.deepEqual(readData(filePath), {
    ...data,
    version: CURRENT_VERSION,
    recurring: [],
    nextRecurringId: 1,
    accounts: ['현금', '카드', '통장'].map((name) => ({ name, opening: 0 })),
  });
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('계좌 목록의 모양과 시작 잔액을 검사한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const valid = { name: '카드', opening: -50000 };
  for (const accounts of [
    undefined, {}, [null], [{ ...valid, name: '' }], [{ ...valid, name: 1 }],
    [{ ...valid, opening: 1.5 }], [{ ...valid, opening: '1' }], [{ ...valid, opening: 2 ** 53 }],
    [valid, valid],
  ]) {
    writeJson(filePath, currentData({ accounts }));
    const { status, stdout, stderr } = runCli(['list'], { env });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${filePath} (accounts가 올바르지 않습니다)\n`);
  }
  writeJson(filePath, currentData({ accounts: [valid] }));
  assert.deepEqual(readData(filePath).accounts, [valid]);
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

test('옛 버전 백업을 현재 버전으로 올려 읽는다', (t) => {
  const filePath = path.join(tempDir(t), 'backup.json');
  const transactions = [transaction({ id: 1, category: '커피' })];
  const original = writeJson(filePath, { version: 1, nextId: 2, transactions });

  const data = readBackup(filePath);
  assert.equal(data.version, CURRENT_VERSION);
  assert.ok(data.categories.expense.includes('커피'));
  assert.deepEqual(data.transactions, transactions);
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('없거나 깨진 백업은 백업 파일 읽기 오류로 보고한다', (t) => {
  const filePath = path.join(tempDir(t), 'backup.json');
  for (const [contents, reason] of [
    [undefined, 'ENOENT'],
    ['{', 'JSON 형식이 잘못되었습니다'],
    ['{}', 'version이 올바르지 않습니다: undefined'],
    [JSON.stringify({ version: CURRENT_VERSION + 1 }), `지원하지 않는 version입니다: ${CURRENT_VERSION + 1}`],
    [JSON.stringify(currentData({ transactions: [null] })), '거래 1번째: 객체가 아닙니다'],
    [JSON.stringify(currentData({ nextId: 3, transactions: [transaction({ id: 2 }), transaction({ id: 2 })] })),
      '거래 #2가 두 번 있습니다'],
  ]) {
    if (contents !== undefined) {
      writeFileSync(filePath, contents);
    }
    assert.throws(() => readBackup(filePath), {
      constructor: DataError,
      message: `백업 파일을 읽을 수 없습니다: ${filePath} (${reason})`,
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
    currentData(),
    currentData({ nextId: 2, transactions: [transaction({ id: 1 })] }),
  ]) {
    writeData(filePath, data);
    assert.deepEqual(readData(filePath), data);
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
  const data = currentData();
  writeData(filePath, data);

  assert.throws(() => writeData(filePath, undefined), {
    constructor: DataError,
    message: `데이터 파일을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`,
  });
  assert.deepEqual(readData(filePath), data);
  assert.deepEqual(readdirSync(directory), ['data.json']);
});

test('새 데이터 파일은 소유자만 접근할 수 있고 덮어쓸 때 기존 권한을 보존한다',
  { skip: process.platform === 'win32' }, (t) => {
    const filePath = path.join(tempDir(t), 'data.json');
    const data = currentData();
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
  const data = currentData();
  writeData(filePath, data);

  assert.throws(() => writeData(filePath, { version: CURRENT_VERSION, amount: 1n }), TypeError);
  assert.deepEqual(readData(filePath), data);
  assert.deepEqual(readdirSync(directory), ['data.json']);
});

test('거래 필드가 잘못되면 위치와 원인을 한 줄로 보고하고 종료한다', (t) => {
  const directory = tempDir(t);
  const filePath = path.join(directory, 'data.json');
  const valid = transaction({ id: 1 });
  const invalid = [
    ...[0, '1', 1.5].map((id) => [{ ...valid, id }, '거래 2번째: id가 양의 정수가 아닙니다']),
    ...['2026-02-30', undefined, ['2026-02-10']].map((date) =>
      [{ ...valid, date }, '거래 #1: date가 있는 날이 아닙니다']),
    ...[undefined, '', 3].map((toAccount) =>
      [{ ...valid, type: 'transfer', toAccount }, '거래 #1: toAccount가 문자열이 아닙니다']),
    [{ ...valid, type: 'refund' }, '거래 #1: type을 알 수 없습니다: refund'],
    [{ ...valid, type: { toString: null } }, '거래 #1: type을 알 수 없습니다: object'],
    ...[0, -1, '1000'].map((amount) => [{ ...valid, amount }, '거래 #1: amount가 양의 정수가 아닙니다']),
    ...['category', 'account', 'memo'].map((field) =>
      [{ ...valid, [field]: 3 }, `거래 #1: ${field}가 문자열이 아닙니다`]),
    ...['a', [1]].map((tags) => [{ ...valid, tags }, '거래 #1: tags가 문자열 배열이 아닙니다']),
    [null, '거래 2번째: 객체가 아닙니다'],
    [[], '거래 2번째: 객체가 아닙니다'],
  ];
  for (const [record, reason] of invalid) {
    writeJson(filePath, { version: 1, nextId: 3, transactions: [transaction({ id: 2 }), record] });
    const { status, stdout, stderr } = runCli(['list'], { env: testEnv(directory) });
    assert.equal(status, 1, reason);
    assert.equal(stdout, '', reason);
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})\n`);
  }
});

test('거래 번호 중복과 잘못된 다음 번호를 데이터 읽기 오류로 보고한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const transactions = [transaction({ id: 5 }), transaction({ id: 2 })];
  for (const [overrides, reason] of [
    [{ transactions: [...transactions, transaction({ id: 2 }), transaction({ id: 5 })] }, '거래 #2가 두 번 있습니다'],
    [{ nextId: 5 }, 'nextId(5)가 가장 큰 거래 번호(5)보다 커야 합니다'],
    [{ nextId: 4 }, 'nextId(4)가 가장 큰 거래 번호(5)보다 커야 합니다'],
    [{ nextId: 0, transactions: [] }, 'nextId(0)가 가장 큰 거래 번호(0)보다 커야 합니다'],
    ...[1.5, '2', 2 ** 53].map((nextId) => [{ nextId }, 'nextId가 올바르지 않습니다']),
  ]) {
    const original = writeJson(filePath, currentData({ nextId: 6, transactions, ...overrides }));
    const { status, stdout, stderr } = runCli(['list'], { env });
    assert.equal(status, 1, stderr);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})\n`);
    assert.equal(readFileSync(filePath, 'utf8'), original);
  }
});

test('다음 거래 번호가 없으면 가장 큰 거래 번호의 다음 번호를 돌려준다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const transactions = [transaction({ id: 5 }), transaction({ id: 2 })];
  const original = writeJson(filePath, currentData({ transactions, nextId: undefined }));
  assert.equal(readData(filePath).nextId, 6);
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('이체와 태그 없는 옛 거래를 읽고 파일은 유지한다', (t) => {
  const filePath = path.join(tempDir(t), 'data.json');
  const transfer = transaction({ id: 1, type: 'transfer', category: '', toAccount: '현금', account: '통장', tags: undefined });
  const original = writeJson(filePath, { version: 1, nextId: 2, transactions: [transfer] });
  assert.deepEqual(readData(filePath).transactions, [{ ...transfer, tags: [] }]);
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('현재 버전까지 올리는 각 단계가 있다', () => {
  for (let version = 1; version < CURRENT_VERSION; version += 1) {
    assert.equal(typeof MIGRATIONS[version], 'function');
  }
});

test('loadData는 빈 데이터 옵션에 명령 사용법을 붙인다', () => {
  const usage = '사용법: gagyebu list';
  assert.throws(() => loadData({ data: '' }, usage), {
    constructor: UsageError, message: '--data 값이 비었습니다', usage,
  });
});
