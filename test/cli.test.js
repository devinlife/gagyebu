import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import pkg from '../package.json' with { type: 'json' };

import { reportError } from '../src/cli.js';
import { DataError, UsageError } from '../src/errors.js';
import { commands } from '../src/registry.js';
import { assertUsageError, binPath, runCli } from './helpers.js';

function run(...args) {
  return runCli([...args]);
}

test('인자 없음과 help의 각 호출 형식은 같은 사용법을 출력한다', () => {
  const outputs = [run(), run('help'), run('--help'), run('help', '--help')];
  const names = Object.keys(commands);
  const width = Math.max(...names.map((name) => name.length));
  const expected = [
    '사용법: gagyebu <명령> [인자] [--옵션 값]', '',
    ...names.map((name) => `  ${name.padEnd(width)}  ${commands[name].summary}`),
    '',
  ].join('\n');
  for (const { status, stdout, stderr } of outputs) {
    assert.equal(status, 0);
    assert.equal(stderr, '');
    assert.equal(stdout, expected);
  }
});

test('등록된 모든 명령은 --help로 자기 사용법을 출력한다', () => {
  const names = Object.keys(commands);
  assert.ok(names.length > 0);

  for (const name of names) {
    const { status, stdout, stderr } = run(name, '--help');
    assert.equal(status, 0, name);
    assert.equal(stderr, '', name);
    assert.ok(stdout.startsWith('사용법: gagyebu '), name);
    if (name !== 'help') {
      assert.ok(stdout.split('\n')[0].includes(`gagyebu ${name} `), name);
    }
  }
});

test('명령 표는 파일 이름에 맞는 명령을 중복 없는 순서로 등록한다', () => {
  const files = readdirSync(new URL('../src/commands/', import.meta.url))
    .filter((file) => file.endsWith('.js'));
  assert.deepEqual(Object.keys(commands).sort(), files.map((file) => file.slice(0, -3)).sort());

  const orders = [];
  for (const file of files) {
    const name = file.slice(0, -3);
    const command = commands[name];
    assert.equal(command.name, name);
    assert.equal(typeof command.run, 'function');
    assert.equal(typeof command.summary, 'string');
    assert.ok(Number.isInteger(command.order), name);
    orders.push(command.order);
  }
  assert.equal(new Set(orders).size, files.length);
  assert.deepEqual(Object.values(commands).map(({ order }) => order), orders.sort((a, b) => a - b));
});

test('help와 --version은 모르는 옵션과 남는 인자를 거부한다', () => {
  for (const [command, usage] of [
    ['help', 'gagyebu help'],
    ['--help', 'gagyebu help'],
    ['--version', 'gagyebu --version'],
  ]) {
    for (const [arg, message] of [
      ['--nope', '알 수 없는 옵션입니다: --nope'],
      ['nope', '예상하지 않은 인자입니다: nope'],
    ]) {
      assertUsageError(run(command, arg), message, `사용법: ${usage}`);
    }
  }
});

test('help 깃발은 등호로 전달한 값을 거부한다', () => {
  assertUsageError(run('help', '--help=nope'), '--help는 값을 받지 않습니다', '사용법: gagyebu help');
});

test('--version은 패키지 버전을 출력한다', () => {
  const { status, stdout, stderr } = run('--version');
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
    assertUsageError(run(...args), `알 수 없는 명령입니다: ${args[0]}`, '사용법은 gagyebu help를 보세요.');
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
  assertUsageError(run('nope\r\nextra'), '알 수 없는 명령입니다: nope\\r\\nextra', '사용법은 gagyebu help를 보세요.');
});
