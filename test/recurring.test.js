import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  assertUsageError, currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson,
} from './helpers.js';

const usages = {
  add: '사용법: gagyebu recurring add <금액> --day <일> [--type expense|income] [--category <분류>] [--account <이름>] [--memo <글>] [--tag <태그>] [--start YYYY-MM] [--end YYYY-MM] [--data <경로>]',
  list: '사용법: gagyebu recurring list [--json] [--data <경로>]',
  rm: '사용법: gagyebu recurring rm <번호> [--data <경로>]',
  apply: '사용법: gagyebu recurring apply [--month YYYY-MM] [--dry-run] [--data <경로>]',
};

function fixture(t) {
  const env = testEnv(tempDir(t), { GAGYEBU_TODAY: '2026-02-10' });
  const filePath = env.GAGYEBU_DATA;
  return {
    env,
    filePath,
    historyPath: `${filePath}.history.json`,
    run: (...args) => runCli(['recurring', ...args], { env }),
    write: (overrides) => writeJson(filePath, currentData(overrides)),
  };
}

function rule(overrides) {
  return {
    id: 1, day: 31, type: 'expense', amount: 12000, category: '식비', account: '현금',
    memo: '', tags: [], start: '2026-02', end: null, ...overrides,
  };
}

function output({ status, stdout, stderr }) {
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  return stdout;
}

function assertDataError({ status, stdout, stderr }, message) {
  assert.equal(status, 1, stderr);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: ${message}\n`);
}

test('반복 규칙의 금액과 거래 옵션을 저장하고 시작 달을 이번 달로 채운다', (t) => {
  const { filePath, run } = fixture(t);
  assert.equal(output(run('add', '1만2천', '--day', '31', '--category', '식비', '--memo', '장보기',
    '--tag', '집,마트', '--tag', '#집', '--tag=정기')),
  '반복 규칙을 더했습니다: #1 매달 31일 지출 12,000원 식비 장보기 #집 #마트 #정기 (2026-02~)\n');

  const saved = readJson(filePath);
  assert.deepEqual(saved.recurring, [rule({ memo: '장보기', tags: ['집', '마트', '정기'] })]);
  assert.equal(saved.nextRecurringId, 2);
  assert.deepEqual(saved.transactions, []);
});

test('기본 계좌와 다른 계좌에 시작과 끝이 같은 달인 규칙을 저장하고 그 달에만 적용한다', (t) => {
  const { filePath, run, write } = fixture(t);
  write({ accounts: [{ name: '현금', opening: 0 }, { name: '통장', opening: 0 }] });
  assert.equal(output(run('add', '12000', '--day', '31', '--category', '식비',
    '--account', '통장', '--start', '2026-03', '--end', '2026-03')),
    '반복 규칙을 더했습니다: #1 매달 31일 지출 12,000원 식비 (2026-03~2026-03)\n');
  assert.deepEqual(readJson(filePath).recurring, [rule({ account: '통장', start: '2026-03', end: '2026-03' })]);

  assert.equal(output(run('apply')), '0건을 만들었습니다(이미 있음 0건).\n');
  assert.match(output(run('apply', '--month', '2026-03')), /1건을 만들었습니다\(이미 있음 0건\)\.$/m);
  assert.equal(output(run('apply', '--month', '2026-04')), '0건을 만들었습니다(이미 있음 0건).\n');
  assert.deepEqual(readJson(filePath).transactions, [transaction({
    id: 1, date: '2026-03-31', amount: 12000, account: '통장', recurringId: 1, recurringMonth: '2026-03',
  })]);
});

test('반복 규칙과 공용 거래 옵션에서 잘못된 값을 거절한다', (t) => {
  const { filePath, run, write } = fixture(t);
  const original = write();
  for (const [args, message] of [
    [[], '금액이 없습니다'],
    [['0'], '금액은 양의 정수여야 합니다: 0'],
    [['1000', '남음'], '예상하지 않은 인자입니다: 남음'],
    [['1000'], '--day가 없습니다'],
    ...['0', '32', '1.5'].map((day) => [['1000', '--day', day], `--day는 1에서 31 사이의 정수여야 합니다: ${day}`]),
    [['1000', '--day', '1', '--type', 'transfer'], '--type은 expense 또는 income이어야 합니다: transfer'],
    [['1000', '--day', '1', '--category='], '--category 값이 비었습니다'],
    [['1000', '--day', '1', '--account='], '--account 값이 비었습니다'],
    [['1000', '--day', '1', '--tag', '두 단어'], '태그는 공백 없는 1~20자여야 합니다: 두 단어'],
    [['1000', '--day', '1', '--start', '2026-13'], '--start는 YYYY-MM 형식의 달이어야 합니다: 2026-13'],
    [['1000', '--day', '1', '--end', '2026-2'], '--end는 YYYY-MM 형식의 달이어야 합니다: 2026-2'],
    [['1000', '--day', '1', '--end', '2026-01'], '--end가 --start보다 이릅니다: 2026-01 < 2026-02'],
  ]) {
    assertUsageError(run('add', ...args), message, usages.add);
  }
  assertDataError(run('add', '1000', '--day', '1', '--category', '미등록'),
    '없는 분류입니다: 미등록 (gagyebu category add로 더하세요)');
  assertDataError(run('add', '1000', '--day', '1', '--account', '미등록'),
    '없는 계좌입니다: 미등록 (gagyebu account add로 더하세요)');
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('규칙을 표와 JSON으로 출력하고 예전 데이터와 빈 목록을 읽는다', (t) => {
  const { filePath, run, write } = fixture(t);
  const original = write({ recurring: undefined, nextRecurringId: undefined });
  assert.equal(output(run('list')), '반복 규칙이 없습니다.\n');
  assert.deepEqual(JSON.parse(output(run('list', '--json'))), []);
  assert.equal(readFileSync(filePath, 'utf8'), original);

  const recurring = [
    rule({ memo: '장보기', end: '2026-05' }),
    rule({ id: 2, day: 1, type: 'income', amount: 2000, category: '급여', memo: '부수입' }),
  ];
  write({ recurring, nextRecurringId: 3 });
  assert.deepEqual(JSON.parse(output(run('list', '--json'))), recurring);
  const [header, first, second] = output(run('list')).trimEnd().split('\n');
  assert.deepEqual(header.split(/ {2,}/), ['번호', '날', '구분', '금액', '분류', '계좌', '메모', '기간']);
  assert.deepEqual(first.split(/ {2,}/), ['1', '31일', '지출', '12,000원', '식비', '현금', '장보기', '2026-02~2026-05']);
  assert.deepEqual(second.split(/ {2,}/), ['2', '1일', '수입', '2,000원', '급여', '현금', '부수입', '2026-02~']);
  assert.equal(first.indexOf('원'), second.indexOf('원'));
});

test('규칙을 지우고 없는 번호를 보고하며 지운 번호는 다시 쓰지 않는다', (t) => {
  const { filePath, run, write } = fixture(t);
  write({ recurring: [rule()], nextRecurringId: 2 });
  assertUsageError(run('rm', '0'), '번호는 양의 정수여야 합니다: 0', usages.rm);
  assert.equal(output(run('rm', '1')), '반복 규칙을 지웠습니다: #1\n');
  assertDataError(run('rm', '1'), '반복 규칙 #1이 없습니다');
  assert.match(output(run('add', '1000', '--day', '1')), /^반복 규칙을 더했습니다: #2 /);
  assert.equal(readJson(filePath).nextRecurringId, 3);
});

test('규칙 번호가 없으면 남은 규칙과 이미 만든 거래의 번호를 함께 고려한다', (t) => {
  const { filePath, run, write } = fixture(t);
  write({
    recurring: [rule({ id: 3 })],
    nextRecurringId: undefined,
    transactions: [transaction({ id: 1, recurringId: 7, recurringMonth: '2026-02' })],
    nextId: 2,
  });
  assert.match(output(run('add', '1000', '--day', '1')), /^반복 규칙을 더했습니다: #8 /);
  assert.equal(readJson(filePath).nextRecurringId, 9);
});

test('다음 규칙 번호를 안전하게 올릴 수 없으면 현재 파일을 보존한다', (t) => {
  const { filePath, run, write } = fixture(t);
  const original = write({ nextRecurringId: 2 ** 53 });
  assertDataError(run('add', '1000', '--day', '1'), '다음 반복 규칙 번호를 저장할 수 없습니다');
  assert.equal(readFileSync(filePath, 'utf8'), original);
});

test('잘못된 규칙 배열과 다음 규칙 번호는 데이터 읽기 오류로 보고한다', (t) => {
  const { filePath, run, write } = fixture(t);
  for (const recurring of [
    null, {}, [null], [rule(), rule()], [rule({ id: 0 })], [rule({ day: 32 })],
    [rule({ type: 'transfer' })], [rule({ amount: 2 ** 53 })], [rule({ category: 1 })],
    [rule({ account: null })], [rule({ memo: false })], [rule({ tags: [1] })],
    [rule({ start: '2026-13' })], [rule({ end: undefined })], [rule({ end: '2026-01' })],
  ]) {
    write({ recurring });
    assertDataError(run('list'), `데이터 파일을 읽을 수 없습니다: ${filePath} (recurring이 올바르지 않습니다)`);
  }
  for (const nextRecurringId of [1, 1.5, null, '2']) {
    write({ recurring: [rule()], nextRecurringId });
    assertDataError(run('list'), `데이터 파일을 읽을 수 없습니다: ${filePath} (nextRecurringId가 올바르지 않습니다)`);
  }
});

test('없는 날을 말일로 옮기고 규칙 번호 순으로 거래 번호와 반복 정보를 매긴다', (t) => {
  const { filePath, run, write } = fixture(t);
  write({
    recurring: [rule({ id: 2, day: 30 }), rule({ tags: ['정기'], memo: '월말' })],
    nextRecurringId: 3,
    transactions: [transaction({ id: 5 })],
    nextId: 6,
  });

  assert.equal(output(run('apply')), [
    '추가했습니다: #6 2026-02-28 지출 12,000원 식비 월말 #정기',
    '추가했습니다: #7 2026-02-28 지출 12,000원 식비',
    '2건을 만들었습니다(이미 있음 0건).',
    '',
  ].join('\n'));
  for (const month of ['2028-02', '2026-04']) {
    assert.match(output(run('apply', '--month', month)), /2건을 만들었습니다\(이미 있음 0건\)\.$/m);
  }
  const saved = readJson(filePath);
  assert.equal(saved.nextId, 12);
  assert.deepEqual(saved.transactions.slice(1), [
    [6, '2026-02-28', 1, '2026-02'], [7, '2026-02-28', 2, '2026-02'],
    [8, '2028-02-29', 1, '2028-02'], [9, '2028-02-29', 2, '2028-02'],
    [10, '2026-04-30', 1, '2026-04'], [11, '2026-04-30', 2, '2026-04'],
  ].map(([id, date, recurringId, recurringMonth]) => transaction({
    id, date, recurringId, recurringMonth, amount: 12000,
    memo: recurringId === 1 ? '월말' : '', tags: recurringId === 1 ? ['정기'] : [],
  })));
});

test('시작 달과 끝 달에 적용하고 기간 밖에는 기록을 만들지 않는다', (t) => {
  const { filePath, historyPath, run, write } = fixture(t);
  const original = write({ recurring: [rule({ day: 10, end: '2026-03' })], nextRecurringId: 2 });
  for (const month of ['2026-01', '2026-04']) {
    assert.equal(output(run('apply', '--month', month)), '0건을 만들었습니다(이미 있음 0건).\n');
  }
  assert.equal(readFileSync(filePath, 'utf8'), original);
  assert.equal(existsSync(historyPath), false);
  for (const month of ['2026-02', '2026-03']) {
    assert.match(output(run('apply', '--month', month)), /1건을 만들었습니다\(이미 있음 0건\)\.$/m);
  }
  assert.deepEqual(readJson(filePath).transactions.map(({ date }) => date), ['2026-02-10', '2026-03-10']);
});

test('재적용할 때 중복 거래와 이력을 쓰지 않고 삭제한 규칙의 거래는 남긴다', (t) => {
  const { filePath, historyPath, run, write } = fixture(t);
  write({ recurring: [rule(), rule({ id: 2 })], nextRecurringId: 3 });
  output(run('apply'));
  const original = readFileSync(filePath, 'utf8');
  const originalHistory = readFileSync(historyPath, 'utf8');

  assert.equal(output(run('apply')), '0건을 만들었습니다(이미 있음 2건).\n');
  assert.equal(readFileSync(filePath, 'utf8'), original);
  assert.equal(readFileSync(historyPath, 'utf8'), originalHistory);

  output(run('rm', '1'));
  assert.equal(output(run('apply')), '0건을 만들었습니다(이미 있음 1건).\n');
  assert.deepEqual(readJson(filePath).transactions, JSON.parse(original).transactions);
});

test('미리보기는 새 거래와 중복 건수를 보여 주고 데이터와 이력을 보존한다', (t) => {
  const { filePath, historyPath, run, write } = fixture(t);
  write({ recurring: [rule()], nextRecurringId: 2 });
  output(run('apply'));
  output(run('add', '1000', '--day', '1', '--type', 'income', '--category', '급여'));
  const original = readFileSync(filePath, 'utf8');
  const originalHistory = readFileSync(historyPath, 'utf8');

  assert.equal(output(run('apply', '--dry-run')), [
    '만들 거래: #2 2026-02-01 수입 1,000원 급여',
    '1건을 만들 예정입니다(이미 있음 1건).',
    '',
  ].join('\n'));
  assert.equal(readFileSync(filePath, 'utf8'), original);
  assert.equal(readFileSync(historyPath, 'utf8'), originalHistory);
  assertUsageError(run('apply', '--month', '2026-13'), '--month는 YYYY-MM 형식의 달이어야 합니다: 2026-13', usages.apply);
});

test('다음 거래 번호가 정수가 아니면 반복 거래를 저장하지 않는다', (t) => {
  const { filePath, historyPath, run, write } = fixture(t);
  const original = write({ recurring: [rule()], nextRecurringId: 2, nextId: true });
  assertDataError(run('apply'), `데이터 파일을 읽을 수 없습니다: ${filePath} (nextId가 올바르지 않습니다)`);
  assert.equal(readFileSync(filePath, 'utf8'), original);
  assert.equal(existsSync(historyPath), false);
});

test('규칙의 분류나 계좌가 없어지면 적용과 미리보기 모두 아무 거래도 저장하지 않는다', (t) => {
  const { filePath, historyPath, run, write } = fixture(t);
  for (const [overrides, message] of [
    [{ category: '미등록' }, '없는 분류입니다: 미등록 (gagyebu category add로 더하세요)'],
    [{ account: '미등록' }, '없는 계좌입니다: 미등록 (gagyebu account add로 더하세요)'],
  ]) {
    const original = write({ recurring: [rule(), rule({ id: 2, ...overrides })], nextRecurringId: 3 });
    assertDataError(run('apply'), message);
    assertDataError(run('apply', '--dry-run'), message);
    assert.equal(readFileSync(filePath, 'utf8'), original);
    assert.equal(existsSync(historyPath), false);
  }
});
