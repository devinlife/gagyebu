import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { formatLocalDateTime } from '../src/format.js';
import { readData } from '../src/store.js';
import { assertUsageError, readJson, runCli, tempDir, testEnv, writeJson } from './helpers.js';

const usage = '사용법: gagyebu undo [--list] [--json] [--data <경로>]';
const empty = '되돌릴 것이 없습니다.\n';

test('여러 명령을 새것부터 되돌리고 이력을 하나씩 지운다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  const before = [];
  for (const args of [
    ['add', '3000', '--category', '식비'],
    ['add', '4000'],
    ['budget', 'set', '식비', '20000'],
  ]) {
    before.push(readData(filePath));
    assert.equal(runCli(args, { env }).status, 0);
  }

  const entries = readJson(historyPath);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const { at, command } = entries[index];
    const { status, stdout, stderr } = runCli(['undo'], { env });
    assert.equal(status, 0);
    assert.equal(stdout, `되돌렸습니다: ${command} (${formatLocalDateTime(new Date(at))})\n`);
    assert.equal(stderr, '');
    assert.deepEqual(readJson(filePath), before[index]);
    assert.deepEqual(readJson(historyPath), entries.slice(0, index));
  }
  const { status, stdout, stderr } = runCli(['undo'], { env });
  assert.equal(status, 0);
  assert.equal(stdout, empty);
  assert.equal(stderr, '');
  assert.deepEqual(readJson(historyPath), []);
});

test('별도 데이터 경로의 이력을 새것부터 표와 JSON으로 보여 준다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const filePath = path.join(directory, 'override.json');
  const historyPath = `${filePath}.history.json`;
  for (const amount of ['1000', '2000']) {
    assert.equal(runCli(['add', amount, '--data', filePath], { env }).status, 0);
  }
  const original = readFileSync(historyPath, 'utf8');
  const entries = JSON.parse(original).toReversed();

  const table = runCli(['undo', '--list', '--data', filePath], { env });
  assert.equal(table.status, 0);
  assert.equal(table.stderr, '');
  const [heading, ...rows] = table.stdout.trimEnd().split('\n');
  assert.match(heading, /^번호 +시각 +명령$/);
  assert.deepEqual(rows.map((row) => row.trimStart().split(/ {2,}/, 3)),
    entries.map(({ at, command }, index) => [String(index + 1), formatLocalDateTime(new Date(at)), command]));

  const json = runCli(['undo', '--list', '--json', '--data', filePath], { env });
  assert.equal(json.status, 0);
  assert.equal(json.stderr, '');
  assert.deepEqual(JSON.parse(json.stdout), entries.map(({ at, command }) => ({ at, command })));
  assert.equal(readFileSync(historyPath, 'utf8'), original);
  assert.equal(existsSync(`${env.GAGYEBU_DATA}.history.json`), false);
});

test('표와 되돌리기는 로컬 시각을 표시하고 JSON에는 저장된 시각을 유지한다', (t) => {
  const env = testEnv(tempDir(t), { TZ: 'Asia/Seoul' });
  const data = readData(env.GAGYEBU_DATA);
  const entries = [
    { at: '시각 원문', command: 'add 1000', data },
    { at: '2026-01-01T00:00:00.000Z', command: 'add 2000', data },
  ];
  writeJson(`${env.GAGYEBU_DATA}.history.json`, entries);

  const table = runCli(['undo', '--list'], { env });
  assert.equal(table.status, 0);
  assert.match(table.stdout, /2026-01-01 09:00:00 +add 2000/);
  assert.match(table.stdout, /시각 원문 +add 1000/);

  const json = runCli(['undo', '--list', '--json'], { env });
  assert.equal(json.status, 0);
  assert.deepEqual(JSON.parse(json.stdout), entries.toReversed().map(({ at, command }) => ({ at, command })));

  const first = runCli(['undo'], { env });
  assert.equal(first.status, 0);
  assert.equal(first.stdout, '되돌렸습니다: add 2000 (2026-01-01 09:00:00)\n');
  const second = runCli(['undo'], { env });
  assert.equal(second.status, 0);
  assert.equal(second.stdout, '되돌렸습니다: add 1000 (시각 원문)\n');
});

test('이력이 없을 때는 안내 또는 빈 JSON 목록을 출력한다', (t) => {
  const env = testEnv(tempDir(t));
  for (const [args, expected] of [[[], empty], [['--list'], empty], [['--list', '--json'], '[]\n']]) {
    const { status, stdout, stderr } = runCli(['undo', ...args], { env });
    assert.equal(status, 0);
    assert.equal(stdout, expected);
    assert.equal(stderr, '');
  }
  assert.equal(existsSync(env.GAGYEBU_DATA), false);
  assert.equal(existsSync(`${env.GAGYEBU_DATA}.history.json`), false);
});

test('깨진 이력은 오류를 보고하고 데이터와 이력을 보존한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  const originalData = writeJson(filePath, readData(filePath));
  for (const [contents, reason] of [
    ['{', 'JSON 형식이 잘못되었습니다'],
    ['[{"command":"add","data":{}}]', '이력 항목 형식이 올바르지 않습니다'],
  ]) {
    writeFileSync(historyPath, contents);
    for (const flags of [[], ['--list'], ['--list', '--json']]) {
      const { status, stdout, stderr } = runCli(['undo', ...flags], { env });
      assert.equal(status, 1);
      assert.equal(stdout, '');
      assert.equal(stderr, `오류: 이력 파일을 읽을 수 없습니다: ${historyPath} (${reason})\n`);
      assert.equal(readFileSync(filePath, 'utf8'), originalData);
      assert.equal(readFileSync(historyPath, 'utf8'), contents);
    }
  }
});

test('데이터 복원에 실패하면 이력 항목을 남긴다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  const original = writeJson(historyPath, [{
    at: '2026-01-01T00:00:00.000Z', command: 'add 1000', data: readData(filePath),
  }]);
  mkdirSync(filePath);

  const { status, stdout, stderr } = runCli(['undo'], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.ok(stderr.startsWith(`오류: 데이터 파일을 쓸 수 없습니다: ${filePath} (`));
  assert.equal(readFileSync(historyPath, 'utf8'), original);
});

test('이력 항목의 데이터가 올바르지 않으면 현재 거래와 이력을 보존한다', (t) => {
  const env = testEnv(tempDir(t));
  const filePath = env.GAGYEBU_DATA;
  const historyPath = `${filePath}.history.json`;
  for (const amount of ['1000', '2000']) {
    assert.equal(runCli(['add', amount], { env }).status, 0);
  }
  const originalData = readFileSync(filePath, 'utf8');
  const entries = readJson(historyPath);
  const latest = entries.at(-1);
  for (const [data, reason] of [
    [{}, 'version이 올바르지 않습니다: undefined'],
    [{ ...latest.data, accounts: null }, 'accounts가 올바르지 않습니다'],
  ]) {
    latest.data = data;
    const originalHistory = writeJson(historyPath, entries);
    const { status, stdout, stderr } = runCli(['undo'], { env });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 이력 파일을 읽을 수 없습니다: ${historyPath} (${reason})\n`);
    assert.equal(readFileSync(filePath, 'utf8'), originalData);
    assert.equal(readFileSync(historyPath, 'utf8'), originalHistory);
  }
});

test('잘못된 인자는 사용법 오류로 보고하고 도움말은 성공한다', (t) => {
  const env = testEnv(tempDir(t));
  for (const [args, message] of [
    [['남는인자'], '예상하지 않은 인자입니다: 남는인자'],
    [['--unknown'], '알 수 없는 옵션입니다: --unknown'],
    [['--json'], '--json은 --list와 함께 써야 합니다'],
    [['--data', ''], '--data 값이 비었습니다'],
    [['--data'], '--data 값이 없습니다'],
  ]) {
    assertUsageError(runCli(['undo', ...args], { env }), message, usage);
  }
  const { status, stdout, stderr } = runCli(['undo', '--help'], { env });
  assert.equal(status, 0);
  assert.equal(stdout, `${usage}\n`);
  assert.equal(stderr, '');
});
