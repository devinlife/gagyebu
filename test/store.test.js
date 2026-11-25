import assert from 'node:assert/strict';
import {
  existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DataError } from '../src/errors.js';
import { CURRENT_VERSION, readData, resolveDataPath, writeData } from '../src/store.js';

function temporaryDirectory(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'gagyebu-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('데이터 경로는 옵션, 환경 변수, 기본값 순으로 정한다', (t) => {
  const home = temporaryDirectory(t);
  const env = { GAGYEBU_DATA: '~/env.json' };
  assert.equal(resolveDataPath('~/option.json', env, home), path.join(home, 'option.json'));
  assert.equal(resolveDataPath(undefined, env, home), path.join(home, 'env.json'));
  assert.equal(resolveDataPath('', env, home), path.join(home, 'env.json'));
  assert.equal(resolveDataPath(undefined, {}, home), path.join(home, '.gagyebu', 'data.json'));
  assert.equal(resolveDataPath('', { GAGYEBU_DATA: '' }, home), path.join(home, '.gagyebu', 'data.json'));
});

test('데이터 경로는 홈과 상대 경로를 절대 경로로 푼다', (t) => {
  const home = temporaryDirectory(t);
  assert.equal(resolveDataPath('~', {}, home), home);
  assert.equal(resolveDataPath('~/x/d.json', {}, home), path.join(home, 'x', 'd.json'));
  assert.equal(resolveDataPath('a/d.json', {}, home), path.resolve('a/d.json'));
  assert.equal(resolveDataPath('~user/d.json', {}, home), path.resolve('~user/d.json'));
  assert.equal(resolveDataPath(path.join(home, 'd.json'), {}, home), path.join(home, 'd.json'));
});

test('데이터 파일이 없으면 폴더나 파일을 만들지 않고 새 초기값을 돌려준다', (t) => {
  const directory = path.join(temporaryDirectory(t), 'missing');
  const filePath = path.join(directory, 'data.json');
  const first = readData(filePath);
  const second = readData(filePath);
  assert.deepEqual(first, { version: 1, nextId: 1, transactions: [] });
  assert.deepEqual(second, first);
  assert.notEqual(first, second);
  assert.notEqual(first.transactions, second.transactions);
  assert.equal(existsSync(directory), false);
  assert.equal(existsSync(filePath), false);
});

test('깨진 JSON과 올바르지 않거나 지원하지 않는 버전을 처리 오류로 보고한다', (t) => {
  const filePath = path.join(temporaryDirectory(t), 'data.json');
  for (const [text, reason] of [
    ['{', 'JSON 형식이 잘못되었습니다'],
    ['null', 'version이 올바르지 않습니다: undefined'],
    ['[]', 'version이 올바르지 않습니다: undefined'],
    ['{"nextId":1}', 'version이 올바르지 않습니다: undefined'],
    ['{"version":"1"}', 'version이 올바르지 않습니다: 1'],
    ['{"version":1.5}', 'version이 올바르지 않습니다: 1.5'],
    ['{"version":0}', 'version이 올바르지 않습니다: 0'],
    ['{"version":{"toString":null}}', 'version이 올바르지 않습니다: {"toString":null}'],
    [JSON.stringify({ version: CURRENT_VERSION + 1 }), '지원하지 않는 version입니다: 2'],
  ]) {
    writeFileSync(filePath, text);
    assert.throws(() => readData(filePath), {
      constructor: DataError,
      message: `데이터 파일을 읽을 수 없습니다: ${filePath} (${reason})`,
    });
  }
});

test('데이터 경로를 읽을 수 없으면 처리 오류로 보고한다', (t) => {
  const filePath = temporaryDirectory(t);
  assert.throws(() => readData(filePath), {
    constructor: DataError,
    message: `데이터 파일을 읽을 수 없습니다: ${filePath} (EISDIR)`,
  });
});

test('하위 폴더에 데이터를 쓰고 덮어써도 올바른 JSON 파일만 남는다', (t) => {
  const directory = path.join(temporaryDirectory(t), 'a', 'b');
  const filePath = path.join(directory, 'data.json');
  for (const data of [
    { version: CURRENT_VERSION, nextId: 1, transactions: [] },
    { version: CURRENT_VERSION, nextId: 2, transactions: [{ id: 1 }] },
  ]) {
    writeData(filePath, data);
    assert.deepEqual(readData(filePath), data);
    assert.equal(readFileSync(filePath, 'utf8'), JSON.stringify(data, null, 2) + '\n');
    assert.deepEqual(readdirSync(directory), ['data.json']);
  }
});

test('데이터 교체에 실패하면 처리 오류를 던지고 임시 파일을 정리한다', (t) => {
  const directory = temporaryDirectory(t);
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
  const directory = temporaryDirectory(t);
  const filePath = path.join(directory, 'data.json');
  const data = { version: CURRENT_VERSION, nextId: 1, transactions: [] };
  writeData(filePath, data);

  assert.throws(() => writeData(filePath, undefined), {
    constructor: DataError,
    message: `데이터 파일을 쓸 수 없습니다: ${filePath} (JSON으로 변환할 수 없습니다)`,
  });
  assert.deepEqual(readData(filePath), data);
  assert.deepEqual(readdirSync(directory), ['data.json']);
});
