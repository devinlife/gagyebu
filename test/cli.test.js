import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));

function runCli(...args) {
  const result = spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('인자 없음, help, --help의 사용법 출력이 같다', () => {
  const outputs = [runCli(), runCli('help'), runCli('--help')];
  const expected = '사용법: gagyebu <명령> [인자] [--옵션 값]\n\n  help  사용법과 명령 목록을 보여 준다.\n';
  for (const { status, stdout, stderr } of outputs) {
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.equal(stdout, expected);
  }
});

test('--version은 패키지 버전을 출력한다', () => {
  const { status, stdout, stderr } = runCli('--version');
  assert.equal(status, 0);
  assert.equal(stdout, `${pkg.version}\n`);
  assert.equal(stderr, '');
});

test('모르는 명령은 오류와 사용법 안내를 출력한다', () => {
  for (const name of ['nope', '--foo', 'constructor']) {
    const { status, stdout, stderr } = runCli(name);
    assert.equal(status, 2);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 알 수 없는 명령 ${name}\n사용법은 gagyebu help를 보세요.\n`);
  }
});

test('진입점은 gagyebu로 등록되어 있고 실행 권한이 있다', () => {
  assert.equal(pkg.bin.gagyebu, 'bin/gagyebu.js');
  assert.equal(readFileSync(binPath, 'utf8').split('\n')[0], '#!/usr/bin/env node');
  assert.ok(statSync(binPath).mode & 0o111);
});
