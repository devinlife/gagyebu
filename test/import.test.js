import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { assertUsageError, currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu import <파일> [--dry-run] [--data <경로>]';
const header = 'date,amount,type';
const validRow = '2026-02-10,1000,expense';

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-import-');
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-02-10' });
  const csv = path.join(directory, '거래.csv');
  const dataPath = env.GAGYEBU_DATA;
  return { directory, env, csv, dataPath, run: (...args) => runCli(['import', ...args], { env }) };
}

function writeDataFixture(file, transactions = [], nextId = 1) {
  return writeJson(file, currentData({ nextId, transactions }));
}

function assertResult({ status, stdout, stderr }, expectedStatus, expectedOut = '', expectedError = '') {
  assert.equal(status, expectedStatus, stderr);
  assert.equal(stdout, expectedOut);
  assert.equal(stderr, expectedError);
}

test('내보낸 거래의 내용을 복원해 새 번호를 주고 다시 가져오면 중복으로 센다', (t) => {
  const { directory, env, csv, dataPath, run } = fixture(t);
  const sourcePath = path.join(directory, '원본.json');
  const transactions = [
    transaction({ id: 41, memo: '그는 "좋다",\r\n라고 했다\n다시 말했다', tags: ["'@회사", '@회식'] }),
    transaction({ id: 53, date: '2026-02-11', type: 'income', category: '급여', account: '@은행', memo: '=SUM(A1)' }),
  ];
  writeDataFixture(sourcePath, transactions, 54);
  assertResult(runCli(['export', '--out', csv, '--data', sourcePath], { env }), 0,
    `2건을 내보냈습니다: ${csv}\n`);
  assertResult(run(csv, '--data', dataPath), 0, '2건을 더했습니다(중복 0건 건너뜀).\n');
  const saved = readJson(dataPath);
  assert.equal(saved.nextId, 3);
  assert.deepEqual(saved.transactions, transactions.map((entry, index) => ({ ...entry, id: index + 1 })));

  const original = readFileSync(dataPath);
  assertResult(run(csv), 0, '0건을 더했습니다(중복 2건 건너뜀).\n');
  assert.deepEqual(readFileSync(dataPath), original);
});

test('BOM과 한글 구분을 읽고 기존 중복을 건너뛴 뒤 nextId부터 추가한다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  const existing = transaction({ id: 3, category: '기타', account: '카드' });
  writeDataFixture(dataPath, [existing], 8);
  writeFileSync(csv, `\uFEFFid,${header},category,account\n`
    + '91,오늘,1000,지출,,\n92,2/11,"12,300원",수입,,\n93,2/11,1만2천,지출,,\n');
  assertResult(run(csv), 0, '2건을 더했습니다(중복 1건 건너뜀).\n');
  const saved = readJson(dataPath);
  assert.equal(saved.nextId, 10);
  assert.deepEqual(saved.transactions, [
    existing,
    transaction({ id: 8, date: '2026-02-11', amount: 12300, type: 'income', category: '기타' }),
    transaction({ id: 9, date: '2026-02-11', amount: 12000, category: '기타' }),
  ]);
});

test('오류 행의 물리 줄 번호를 출력하고 기존 데이터 파일을 보존한다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  const original = writeDataFixture(dataPath);
  writeFileSync(csv, `\uFEFF${header},memo\r\n\r\n${validRow},"첫째\r\n둘째"\r\n`
    + '2026-02-10,0,expense,\r\n'
    + validRow + ',정상\r\n'
    + '2026-02-10,1000,"이\r\n체",\r\n');
  const expected = '오류: 2개 행이 잘못되어 아무것도 더하지 않았습니다\n'
    + '5행: 금액은 양의 정수여야 합니다: 0\n'
    + '7행: type은 expense·income·지출·수입 중 하나여야 합니다: 이\\r\\n체\n';
  for (const flags of [[], ['--dry-run']]) {
    assertResult(run(csv, ...flags), 1, '', expected);
    assert.equal(readFileSync(dataPath, 'utf8'), original);
  }
});

test('오류 행을 20개까지 표시하고 남은 개수를 알린다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  writeFileSync(csv, header + '\n' + '2026-02-10,0,expense\n'.repeat(25));
  const details = Array.from({ length: 20 }, (_, index) =>
    `${index + 2}행: 금액은 양의 정수여야 합니다: 0\n`).join('');
  assertResult(run(csv), 1, '', '오류: 25개 행이 잘못되어 아무것도 더하지 않았습니다\n' + details + '… 외 5행\n');
  assert.equal(existsSync(dataPath), false);
});

test('dry-run은 더할 건수와 중복을 표시하고 데이터 파일을 쓰지 않는다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  writeFileSync(csv, `${header}\n${validRow}\n2026-02-11,1000,income\n`);
  assertResult(run(csv, '--dry-run'), 0, '2건을 더할 수 있습니다(중복 0건).\n');
  assert.equal(existsSync(dataPath), false);

  const original = writeDataFixture(dataPath, [transaction({ id: 1, category: '기타' })], 2);
  assertResult(run(csv, '--dry-run'), 0, '1건을 더할 수 있습니다(중복 1건).\n');
  assert.equal(readFileSync(dataPath, 'utf8'), original);
});

test('파일 읽기, CSV 형식과 필수 칸 오류는 한 줄을 표시하고 데이터를 보존한다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  const original = writeDataFixture(dataPath);
  assertResult(run(csv), 1, '', `오류: 파일을 읽을 수 없습니다: ${csv} (ENOENT)\n`);
  assert.equal(readFileSync(dataPath, 'utf8'), original);
  writeFileSync(csv, header + '\n"2026-02-10');
  assertResult(run(csv), 1, '', '오류: CSV 형식이 잘못되었습니다: 2행: 따옴표가 닫히지 않았습니다\n');
  assert.equal(readFileSync(dataPath, 'utf8'), original);
  writeFileSync(csv, 'date,amount\n2026-02-10,1000\n');
  assertResult(run(csv), 1, '', '오류: 필요한 칸이 없습니다: type\n');
  assert.equal(readFileSync(dataPath, 'utf8'), original);
});

test('CP949로 인코딩된 메모가 있으면 가져오기를 거절하고 데이터를 보존한다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  const original = writeDataFixture(dataPath);
  writeFileSync(csv, Buffer.concat([
    Buffer.from(header + ',memo\n' + validRow + ','),
    Buffer.from([0xc7, 0xd1]), // CP949의 '한'
    Buffer.from('\n'),
  ]));

  assertResult(run(csv), 1, '', '오류: UTF-8 파일이 아닙니다: ' + csv + '\n');
  assert.equal(readFileSync(dataPath, 'utf8'), original);
});

test('사용법 오류는 종료 코드 2와 사용법을 표시한다', (t) => {
  const { csv, dataPath, run } = fixture(t);
  for (const [args, message] of [
    [[], '파일이 없습니다'],
    [[csv, 'extra'], '예상하지 않은 인자입니다: extra'],
    [[csv, '--nope'], '알 수 없는 옵션입니다: --nope'],
    [[csv, '--data', ''], '--data 값이 비었습니다'],
    [[csv, '--data'], '--data 값이 없습니다'],
  ]) {
    assertUsageError(run(...args), message, usage);
  }
  assert.equal(existsSync(dataPath), false);
});

test('import --help는 사용법 한 줄을 표시한다', (t) => {
  const { run } = fixture(t);
  assertResult(run('--help'), 0, usage + '\n');
});
