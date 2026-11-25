import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

import { reportError } from '../src/cli.js';
import { DataError, UsageError } from '../src/errors.js';

const binPath = fileURLToPath(new URL('../bin/gagyebu.js', import.meta.url));

function runCli(...args) {
  const result = spawnSync(process.execPath, [binPath, ...args], { encoding: 'utf8' });
  assert.ifError(result.error);
  return result;
}

test('인자 없음과 help의 각 호출 형식은 같은 사용법을 출력한다', () => {
  const outputs = [runCli(), runCli('help'), runCli('--help'), runCli('help', '--help')];
  const expected = '사용법: gagyebu <명령> [인자] [--옵션 값]\n\n  help  사용법과 명령 목록을 보여 준다.\n';
  for (const { status, stdout, stderr } of outputs) {
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.equal(stdout, expected);
  }
});

test('help와 --version은 모르는 옵션과 남는 인자를 거부한다', () => {
  for (const [command, usage] of [
    ['help', 'gagyebu help'],
    ['--help', 'gagyebu help'],
    ['--version', 'gagyebu --version'],
  ]) {
    for (const [arg, message] of [
      ['--nope', '알 수 없는 옵션 --nope'],
      ['nope', '예상하지 않은 인자 nope'],
    ]) {
      const { status, stdout, stderr } = runCli(command, arg);
      const invocation = `${command} ${arg}`;
      assert.equal(status, 2, invocation);
      assert.equal(stdout, '', invocation);
      assert.equal(stderr, `오류: ${message}\n사용법: ${usage}\n`, invocation);
    }
  }
});

test('help 깃발은 등호로 전달한 값을 거부한다', () => {
  const { status, stdout, stderr } = runCli('help', '--help=nope');
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: --help은 값을 받지 않는다\n사용법: gagyebu help\n');
});

test('--version은 패키지 버전을 출력한다', () => {
  const { status, stdout, stderr } = runCli('--version');
  assert.equal(status, 0);
  assert.equal(stdout, `${pkg.version}\n`);
  assert.equal(stderr, '');
});

test('모르는 명령은 오류와 사용법 안내를 출력한다', () => {
  for (const args of [
    ['nope'],
    ['--foo'],
    ['constructor'],
    ['nope', '--foo'],
    ['nope', 'extra'],
  ]) {
    const { status, stdout, stderr } = runCli(...args);
    assert.equal(status, 2);
    assert.equal(stdout, '');
    assert.equal(stderr, `오류: 알 수 없는 명령 ${args[0]}\n사용법은 gagyebu help를 보세요.\n`);
  }
});

test('진입점은 gagyebu로 등록되어 있고 실행 권한이 있다', () => {
  assert.equal(pkg.bin.gagyebu, 'bin/gagyebu.js');
  assert.equal(readFileSync(binPath, 'utf8').split('\n')[0], '#!/usr/bin/env node');
  assert.ok(statSync(binPath).mode & 0o111);
});

test('처리 오류는 한 줄을 출력하고 종료 코드 1을 돌려준다', (t) => {
  const stderr = t.mock.method(console, 'error', () => {});
  const stdout = t.mock.method(console, 'log', () => {});
  assert.equal(reportError(new DataError('x')), 1);
  assert.deepEqual(stderr.mock.calls.map(({ arguments: args }) => args), [['오류: x']]);
  assert.equal(stdout.mock.callCount(), 0);
});

test('사용법 오류는 안내를 덧붙이고 종료 코드 2를 돌려준다', (t) => {
  const stderr = t.mock.method(console, 'error', () => {});
  const stdout = t.mock.method(console, 'log', () => {});
  assert.equal(reportError(new UsageError('x', '사용법: gagyebu y')), 2);
  assert.deepEqual(stderr.mock.calls.map(({ arguments: args }) => args), [
    ['오류: x'],
    ['사용법: gagyebu y'],
  ]);
  assert.equal(stdout.mock.callCount(), 0);
});

test('예상하지 못한 오류는 스택이 있는 오류 객체를 출력한다', (t) => {
  const stderr = t.mock.method(console, 'error', () => {});
  const stdout = t.mock.method(console, 'log', () => {});
  const error = new TypeError('boom');
  assert.equal(reportError(error), 1);
  assert.equal(stderr.mock.callCount(), 1);
  assert.equal(stderr.mock.calls[0].arguments[0], error);
  assert.equal(stdout.mock.callCount(), 0);
});

test('오류 메시지에 개행이 있어도 한 줄에 출력한다', () => {
  const { status, stdout, stderr } = runCli('nope\r\nextra');
  assert.equal(status, 2);
  assert.equal(stdout, '');
  assert.equal(stderr, '오류: 알 수 없는 명령 nope\\r\\nextra\n사용법은 gagyebu help를 보세요.\n');
});
