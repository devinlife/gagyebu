import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { resolveDataPath } from '../src/store.js';

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
