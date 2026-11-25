import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { CURRENT_VERSION, readData } from '../src/store.js';
import { assertUsageError, currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu restore <백업 파일> [--yes] [--data <경로>]';

test('잘못된 백업은 거부하고 현재 데이터와 이력을 보존한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = env.GAGYEBU_DATA;
  const backupPath = path.join(directory, 'backup.json');
  const historyPath = `${dataPath}.history.json`;
  const data = currentData({ nextId: 2, transactions: [transaction({ id: 1 })] });
  const original = writeJson(dataPath, data);
  const history = [{ at: '2026-01-01T00:00:00.000Z', command: 'add 1000', data: currentData() }];

  for (const [text, reason] of [
    [undefined, 'ENOENT'],
    ['{', 'JSON 형식이 잘못되었습니다'],
    [JSON.stringify({ version: CURRENT_VERSION + 1 }), `지원하지 않는 version입니다: ${CURRENT_VERSION + 1}`],
    [JSON.stringify(currentData({ transactions: [null] })), '거래 1번째: 객체가 아닙니다'],
  ]) {
    if (text !== undefined) {
      writeFileSync(backupPath, text);
    }
    const { status, stdout, stderr } = runCli(['restore', backupPath, '--yes'], { env });
    assert.equal(status, 1);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 백업 파일을 읽을 수 없습니다: ${backupPath} (${reason})\n`);
    assert.equal(readFileSync(dataPath, 'utf8'), original);
    assert.equal(existsSync(historyPath), false);
  }

  const savedHistory = writeJson(historyPath, history);
  const result = runCli(['restore', backupPath, '--yes'], { env });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(dataPath, 'utf8'), original);
  assert.equal(readFileSync(historyPath, 'utf8'), savedHistory);
});

test('깨진 현재 데이터와 이력을 보존하면서 백업을 복원한다', async (t) => {
  for (const [label, text, hasHistory] of [
    ['깨진 JSON', '{깨진', false],
    ['깨진 레코드', JSON.stringify(currentData({ transactions: [null] })), true],
    ['높은 버전', JSON.stringify(currentData({ version: CURRENT_VERSION + 1 })), false],
  ]) {
    await t.test(label, (t) => {
      const directory = tempDir(t);
      const env = testEnv(directory);
      const dataPath = env.GAGYEBU_DATA;
      const historyPath = `${dataPath}.history.json`;
      const backupPath = path.join(directory, 'backup.json');
      const backup = currentData({ nextId: 2, transactions: [transaction({ id: 1 })] });
      writeJson(backupPath, backup);
      const original = Buffer.from(text);
      writeFileSync(dataPath, original);
      const history = [{ at: '2026-01-01T00:00:00.000Z', command: 'add 1000', data: currentData() }];
      const savedHistory = hasHistory ? writeJson(historyPath, history) : null;

      const { status, stdout, stderr } = runCli(['restore', backupPath, '--yes'], { env });
      assert.equal(status, 0);
      assert.equal(stderr, '');
      assert.deepEqual(readJson(dataPath), backup);
      const files = readdirSync(directory).filter((name) => name.startsWith('data.json.broken-'));
      assert.equal(files.length, 1);
      assert.match(files[0], /\.broken-\d{8}-\d{6}$/);
      const brokenPath = path.join(directory, files[0]);
      assert.equal(stdout, `복원했습니다: ${backupPath} (거래 1건)\n깨진 데이터 파일을 남겨 두었습니다: ${brokenPath}\n`);
      assert.deepEqual(readFileSync(brokenPath), original);
      if (hasHistory) {
        assert.equal(readFileSync(historyPath, 'utf8'), savedHistory);
      } else {
        assert.equal(existsSync(historyPath), false);
      }
    });
  }
});

test('깨진 현재 데이터에서 --yes 없이 복원하면 읽을 수 없음으로 안내한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = env.GAGYEBU_DATA;
  const backupPath = path.join(directory, 'backup.json');
  const backup = writeJson(backupPath, currentData());
  writeFileSync(dataPath, '{깨진');

  const { status, stdout, stderr } = runCli(['restore', backupPath], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: 지금 데이터(읽을 수 없음)를 백업(거래 0건)으로 바꾸려면 --yes를 붙이세요.\n');
  assert.equal(readFileSync(dataPath, 'utf8'), '{깨진');
  assert.equal(readFileSync(backupPath, 'utf8'), backup);
  assert.deepEqual(readdirSync(directory).sort(), ['backup.json', 'data.json']);
});

test('데이터 경로가 폴더이면 복원 중 폴더를 옮기지 않는다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = env.GAGYEBU_DATA;
  mkdirSync(dataPath);
  const backupPath = path.join(dataPath, 'backup.json');
  const backup = writeJson(backupPath, currentData());

  const { status, stdout, stderr } = runCli(['restore', backupPath, '--yes'], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 깨진 데이터 파일을 옮길 수 없습니다: ${dataPath} (EISDIR)\n`);
  assert.equal(readFileSync(backupPath, 'utf8'), backup);
  assert.deepEqual(readdirSync(directory), ['data.json']);
});

test('--yes 없이 복원하면 거래 수를 안내하고 데이터와 이력을 보존한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = env.GAGYEBU_DATA;
  const historyPath = `${dataPath}.history.json`;
  const backupPath = path.join(directory, 'backup.json');
  assert.equal(runCli(['add', '1000'], { env }).status, 0);
  const original = readFileSync(dataPath);
  const history = readFileSync(historyPath);
  writeJson(backupPath, currentData());

  const { status, stdout, stderr } = runCli(['restore', backupPath], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: 지금 데이터(거래 1건)를 백업(거래 0건)으로 바꾸려면 --yes를 붙이세요.\n');
  assert.deepEqual(readFileSync(dataPath), original);
  assert.deepEqual(readFileSync(historyPath), history);
});

test('옛 백업을 현재 버전으로 올려 쓰고 undo 한 번으로 복원 전으로 돌아간다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory, { TZ: 'Asia/Seoul' });
  const dataPath = env.GAGYEBU_DATA;
  const historyPath = `${dataPath}.history.json`;
  const backupPath = path.join(directory, 'backup.json');
  assert.equal(runCli(['add', '1000'], { env }).status, 0);
  const original = readJson(dataPath);
  const history = readJson(historyPath);
  const transactions = [transaction({ id: 1, amount: 2500, category: '커피', account: '카드' })];
  const backupText = writeJson(backupPath, { version: 1, nextId: 2, transactions });

  const restore = runCli(['restore', backupPath, '--yes'], { env });
  assert.equal(restore.status, 0);
  assert.equal(restore.stdout, `복원했습니다: ${backupPath} (거래 1건)\n`);
  assert.equal(restore.stderr, '');
  const result = readJson(dataPath);
  assert.equal(result.version, CURRENT_VERSION);
  assert.ok(result.categories.expense.includes('커피'));
  assert.ok(result.accounts.some(({ name }) => name === '카드'));
  assert.deepEqual(result.transactions, transactions);
  assert.equal(readFileSync(backupPath, 'utf8'), backupText);

  const entries = readJson(historyPath);
  assert.equal(entries.length, history.length + 1);
  assert.deepEqual(entries.slice(0, -1), history);
  const { at, command, data } = entries.at(-1);
  assert.equal(at, new Date(at).toISOString());
  assert.equal(command, `restore ${backupPath} --yes`);
  assert.deepEqual(data, original);

  const undo = runCli(['undo'], { env });
  assert.equal(undo.status, 0);
  assert.ok(undo.stdout.startsWith(`되돌렸습니다: ${command} (`));
  assert.match(undo.stdout, /\(\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\)\n$/);
  assert.deepEqual(readJson(dataPath), original);
  assert.deepEqual(readJson(historyPath), history);
});

test('백업을 만들고 거래를 추가한 뒤 복원하면 이전 거래 수로 돌아간다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const dataPath = path.join(directory, 'ledger.json');
  const backups = path.join(directory, 'backups');
  const add = (amount) => runCli(['add', amount, '--data', dataPath], { env });
  assert.equal(add('1000').status, 0);
  const original = readJson(dataPath);
  assert.equal(runCli(['backup', '--data', dataPath], { env }).status, 0);
  const listing = runCli(['backup', '--list', '--json', '--data', dataPath], { env });
  assert.equal(listing.status, 0);
  const [{ name }] = JSON.parse(listing.stdout);
  assert.equal(add('2000').status, 0);
  assert.equal(readJson(dataPath).transactions.length, 2);

  const result = runCli(['restore', path.join(backups, name), '--yes', '--data', dataPath], { env });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.deepEqual(readJson(dataPath), original);
  assert.equal(existsSync(env.GAGYEBU_DATA), false);
});

test('데이터 파일이 아직 없으면 0건으로 확인하고 백업을 복원한다', (t) => {
  const directory = tempDir(t);
  const env = testEnv(directory);
  const backupPath = path.join(directory, 'backup.json');
  const backup = currentData({ nextId: 2, transactions: [transaction({ id: 1 })] });
  writeJson(backupPath, backup);
  const preview = runCli(['restore', backupPath], { env });
  assert.equal(preview.status, 1);
  assert.equal(preview.stderr, '오류: 지금 데이터(거래 0건)를 백업(거래 1건)으로 바꾸려면 --yes를 붙이세요.\n');
  assert.equal(existsSync(env.GAGYEBU_DATA), false);

  const result = runCli(['restore', backupPath, '--yes'], { env });
  assert.equal(result.status, 0);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout, `복원했습니다: ${backupPath} (거래 1건)\n`);
  assert.deepEqual(readData(env.GAGYEBU_DATA), backup);
});

test('복원의 잘못된 인자를 거부하고 도움말을 제공한다', (t) => {
  const env = testEnv(tempDir(t));
  for (const [args, reason] of [
    [[], '백업 파일이 없습니다'],
    [[''], '백업 파일이 없습니다'],
    [['backup.json', '남는인자'], '예상하지 않은 인자입니다: 남는인자'],
    [['backup.json', '--unknown'], '알 수 없는 옵션입니다: --unknown'],
    [['backup.json', '--data', ''], '--data 값이 비었습니다'],
    [['backup.json', '--data'], '--data 값이 없습니다'],
  ]) {
    assertUsageError(runCli(['restore', ...args], { env }), reason, usage);
  }
  const { status, stdout, stderr } = runCli(['restore', '--help'], { env });
  assert.equal(status, 0);
  assert.equal(stdout, `${usage}\n`);
  assert.equal(stderr, '');
});
