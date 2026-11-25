import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { DataError } from '../src/errors.js';
import { describeCommand, readData, setCommandSummary, writeData } from '../src/store.js';
import { readJson, runCli, tempDir, testEnv, writeJson } from './helpers.js';

test('저장 직전 데이터를 명령과 시각과 함께 오래된 것부터 기록한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  const changes = [
    ['add', '12000', '--category', '식비'],
    ['add', '5000', '--memo', '점심 값'],
    ['budget', 'set', '식비', '50000'],
  ];
  const before = [];
  for (const args of changes) {
    before.push(readData(filePath));
    assert.equal(runCli(args, { env }).status, 0);
  }

  const entries = readJson(historyPath);
  assert.equal(entries.length, 3);
  assert.deepEqual(entries.map(({ command }) => command), [
    'add 12000 --category 식비', 'add 5000 --memo "점심 값"', 'budget set 식비 50000',
  ]);
  assert.deepEqual(entries.map(({ data }) => data), before);
  for (const { at } of entries) {
    assert.equal(new Date(at).toISOString(), at);
  }
  if (process.platform !== 'win32') {
    assert.equal(statSync(historyPath).mode & 0o777, 0o600);
  }
});

test('이력에는 최근 20개만 남긴다', (t) => {
  const env = testEnv(tempDir(t));
  for (let amount = 1; amount <= 21; amount += 1) {
    assert.equal(runCli(['add', String(amount)], { env }).status, 0);
  }
  const entries = readJson(`${env.GAGYEBU_DATA}.history.json`);
  assert.deepEqual(entries.map(({ command }) => command),
    Array.from({ length: 20 }, (_, index) => `add ${index + 2}`));
});

test('데이터 쓰기가 실패해도 먼저 기록한 직전 상태는 이력에 남는다', (t) => {
  const filePath = testEnv(tempDir(t)).GAGYEBU_DATA;
  const before = readData(filePath);
  const original = writeJson(filePath, before);
  setCommandSummary('add 1000');
  try {
    assert.throws(() => writeData(filePath, undefined), {
      constructor: DataError,
      message: `데이터 파일을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`,
    });
  } finally {
    setCommandSummary(undefined);
  }
  assert.equal(readFileSync(filePath, 'utf8'), original);
  const entries = readJson(`${filePath}.history.json`);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].command, 'add 1000');
  assert.deepEqual(entries[0].data, before);
});

test('이력 파일을 읽을 수 없으면 데이터와 기존 이력 경로를 보존한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  const original = writeJson(filePath, readData(filePath));
  mkdirSync(historyPath);
  const { status, stdout, stderr } = runCli(['add', '1000'], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 이력 파일을 읽을 수 없습니다: ${historyPath} (EISDIR)\n`);
  assert.equal(readFileSync(filePath, 'utf8'), original);
  assert.equal(statSync(historyPath).isDirectory(), true);
});

test('읽기 명령과 사용법 오류는 이력을 만들거나 바꾸지 않는다', (t) => {
  const env = testEnv(tempDir(t));
  const historyPath = `${env.GAGYEBU_DATA}.history.json`;
  const checks = [
    [['list'], 0], [['summary'], 0], [['export'], 0], [['--help'], 0], [['add'], 2],
  ];
  for (const [args, status] of checks) {
    assert.equal(runCli(args, { env }).status, status);
    assert.equal(existsSync(historyPath), false);
  }

  assert.equal(runCli(['add', '1000'], { env }).status, 0);
  const original = readFileSync(historyPath, 'utf8');
  for (const [args, status] of checks) {
    assert.equal(runCli(args, { env }).status, status);
    assert.equal(readFileSync(historyPath, 'utf8'), original);
  }
});

test('깨진 이력은 경고 한 줄을 쓰고 새로 시작한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  for (const [index, [contents, reason]] of [
    ['{', 'JSON 형식이 잘못되었습니다'],
    ['{}', '이력 항목 형식이 올바르지 않습니다'],
    ['[{"at":"지금","command":"add","data":null}]', '이력 항목 형식이 올바르지 않습니다'],
  ].entries()) {
    const before = readData(filePath);
    writeFileSync(historyPath, contents);
    const amount = index + 1;
    const { status, stderr } = runCli(['add', String(amount)], { env });
    assert.equal(status, 0);
    assert.equal(stderr, `경고: 이력 파일이 깨져 새로 시작합니다: ${historyPath} (${reason})\n`);
    assert.equal(readJson(filePath).transactions.at(-1).amount, amount);
    const entries = readJson(historyPath);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].command, `add ${amount}`);
    assert.deepEqual(entries[0].data, before);
  }
});

test('빈 인자와 공백·따옴표·제어 문자가 있는 인자는 따옴표로 감싼다', () => {
  const quoted = ['', '점심 값', '"인용"', "'인용'", '줄\n바꿈', '\u0001'];
  assert.equal(describeCommand(['add', '5000', ...quoted]),
    ['add', '5000', ...quoted.map((arg) => JSON.stringify(arg))].join(' '));
});
