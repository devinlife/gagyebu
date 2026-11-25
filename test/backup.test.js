import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { backupDirectory, createBackup, restoreBackup } from '../src/backup.js';
import { assertUsageError, currentData, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu backup [--list] [--json] [--dir <폴더>] [--data <경로>]';

test('같은 초의 백업에 일련번호를 붙이고 기존 백업과 원본 바이트를 보존한다', (t) => {
  const directory = tempDir(t);
  const dataPath = path.join(directory, 'data.json');
  const target = backupDirectory(dataPath);
  const now = new Date(2026, 10, 26, 9, 5, 7);
  const transactions = [transaction({ id: 1 })];
  const originals = ['\n', '\n\n', ''].map((ending) =>
    JSON.stringify({ version: 1, nextId: 2, transactions }) + ending);
  assert.equal(target, path.join(directory, 'backups'));
  assert.equal(backupDirectory(dataPath, './snapshots'), path.resolve('snapshots'));

  for (const [index, suffix] of ['', '-2', '-3'].entries()) {
    writeFileSync(dataPath, originals[index]);
    assert.deepEqual(createBackup(dataPath, target, now), {
      path: path.join(target, `gagyebu-20261126-090507${suffix}.json`), count: 1,
    });
  }

  for (const [index, suffix] of ['', '-2', '-3'].entries()) {
    assert.deepEqual(readFileSync(path.join(target, `gagyebu-20261126-090507${suffix}.json`)),
      Buffer.from(originals[index]));
  }
  assert.equal(readFileSync(dataPath, 'utf8'), originals.at(-1));
});

test('같은 초에 남겨 둔 깨진 파일을 덮어쓰지 않는다', (t) => {
  const dataPath = path.join(tempDir(t), 'data.json');
  const now = new Date(2026, 10, 26, 9, 5, 7);
  const backup = currentData();
  const base = `${dataPath}.broken-20261126-090507`;

  writeFileSync(dataPath, '{첫 원본');
  assert.deepEqual(restoreBackup(dataPath, backup, now), { brokenPath: base });
  writeFileSync(dataPath, '{둘째 원본');
  assert.deepEqual(restoreBackup(dataPath, backup, now), { brokenPath: `${base}-2` });

  assert.equal(readFileSync(base, 'utf8'), '{첫 원본');
  assert.equal(readFileSync(`${base}-2`, 'utf8'), '{둘째 원본');
});

test('백업 명령은 기본 폴더 또는 지정 폴더에 쓰고 데이터와 이력을 보존한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = path.join(directory, 'ledger', 'ledger.json');
  assert.equal(runCli(['add', '1000', '--data', dataPath], { env }).status, 0);
  const original = readFileSync(dataPath);
  const historyPath = `${dataPath}.history.json`;
  const history = readFileSync(historyPath);
  const custom = path.join(directory, 'snapshots');

  for (const [flags, folder] of [[[], path.join(path.dirname(dataPath), 'backups')], [['--dir', custom], custom]]) {
    const result = runCli(['backup', '--data', dataPath, ...flags], { env });
    assert.equal(result.status, 0);
    assert.equal(result.stderr, '');
    const match = /^백업했습니다: (.+) \(거래 1건\)\n$/.exec(result.stdout);
    assert.ok(match, result.stdout);
    assert.equal(path.dirname(match[1]), folder);
    assert.match(path.basename(match[1]), /^gagyebu-\d{8}-\d{6}\.json$/);
    assert.deepEqual(readFileSync(match[1]), original);
  }
  assert.deepEqual(readFileSync(dataPath), original);
  assert.deepEqual(readFileSync(historyPath), history);
});

test('원본이 없거나 깨져 있으면 백업 폴더를 만들지 않는다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const missing = runCli(['backup'], { env });
  assert.equal(missing.status, 1);
  assert.equal(missing.stdout, '');
  assert.equal(missing.stderr, '오류: 백업할 데이터 파일이 없습니다\n');
  assert.equal(existsSync(path.join(directory, 'backups')), false);
  assert.equal(existsSync(env.GAGYEBU_DATA), false);

  writeFileSync(env.GAGYEBU_DATA, '{');
  const broken = runCli(['backup'], { env });
  assert.equal(broken.status, 1);
  assert.equal(broken.stdout, '');
  assert.equal(broken.stderr, `오류: 데이터 파일을 읽을 수 없습니다: ${env.GAGYEBU_DATA} (JSON 형식이 잘못되었습니다)\n`);
  assert.equal(existsSync(path.join(directory, 'backups')), false);
});

test('백업 목록은 시각과 일련번호의 내림차순으로 이름, 바이트 크기, 거래 수를 표시한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const target = path.join(directory, 'backups');
  mkdirSync(target);
  const contents = JSON.stringify(currentData({
    nextId: 2, transactions: [transaction({ id: 1, memo: '가'.repeat(400) })],
  }));
  const backups = [
    ['gagyebu-20261126-090507-12.json', contents, 1],
    ['gagyebu-20261126-090507-3.json', contents, 1],
    ['gagyebu-20261126-090507-2.json', '{', null],
    ['gagyebu-20261126-090507.json', contents, 1],
    ['gagyebu-20261125-090507.json', contents, 1],
  ];
  for (const [name, text] of backups.toReversed()) {
    writeFileSync(path.join(target, name), text);
  }
  writeFileSync(path.join(target, 'notes.txt'), contents);
  mkdirSync(path.join(target, 'gagyebu-20261127-090507.json'));

  const table = runCli(['backup', '--list'], { env });
  assert.equal(table.status, 0);
  assert.equal(table.stderr, '');
  const [header, ...rows] = table.stdout.trimEnd().split('\n');
  assert.match(header, /^이름 +크기 +거래$/);
  assert.deepEqual(rows.map((row) => row.split(/ {2,}/)), backups.map(([name, text, count]) => [
    name, `${Buffer.byteLength(text).toLocaleString('en-US')}B`, count === null ? '읽을 수 없음' : '1건',
  ]));
  assert.ok(rows.every((row) => row.indexOf('B') === rows[0].indexOf('B')));

  const json = runCli(['backup', '--list', '--json'], { env });
  assert.equal(json.status, 0);
  assert.equal(json.stderr, '');
  assert.deepEqual(JSON.parse(json.stdout), backups.map(([name, text, transactions]) => ({
    name, size: Buffer.byteLength(text), transactions,
  })));
});

test('비어 있거나 없는 백업 폴더는 빈 목록으로 처리한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const target = path.join(directory, 'backups');
  for (const exists of [false, true]) {
    if (exists) {
      mkdirSync(target);
    }
    for (const [flags, expected] of [[[], '백업이 없습니다.\n'], [['--json'], '[]\n']]) {
      const { status, stdout, stderr } = runCli(['backup', '--list', ...flags], { env });
      assert.equal(status, 0);
      assert.equal(stdout, expected);
      assert.equal(stderr, '');
    }
    assert.equal(existsSync(target), exists);
  }
});

test('백업 폴더를 탐색할 수 없으면 오류 한 줄을 출력한다', {
  skip: process.getuid === undefined || process.getuid() === 0,
}, (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const target = path.join(directory, 'backups');
  mkdirSync(target);
  writeJson(path.join(target, 'gagyebu-20261126-090507.json'), currentData());
  chmodSync(target, 0o600);
  try {
    const { status, stdout, stderr } = runCli(['backup', '--list'], { env });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 백업 폴더를 읽을 수 없습니다: ${target} (EACCES)\n`);
  } finally {
    chmodSync(target, 0o700);
  }
});

test('백업의 잘못된 인자를 거부하고 도움말을 제공한다', (t) => {
  const env = testEnv(tempDir(t));
  for (const [args, reason] of [
    [['--unknown'], '알 수 없는 옵션입니다: --unknown'],
    [['남는인자'], '예상하지 않은 인자입니다: 남는인자'],
    [['--dir', ''], '--dir 값이 비었습니다'],
    [['--dir'], '--dir 값이 없습니다'],
    [['--data', ''], '--data 값이 비었습니다'],
    [['--data'], '--data 값이 없습니다'],
    [['--json'], '--json은 --list와 함께 써야 합니다'],
  ]) {
    assertUsageError(runCli(['backup', ...args], { env }), reason, usage);
  }
  const { status, stdout, stderr } = runCli(['backup', '--help'], { env });
  assert.equal(status, 0);
  assert.equal(stdout, `${usage}\n`);
  assert.equal(stderr, '');
});
