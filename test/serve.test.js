import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { withParticle } from '../src/format.js';
import { assertUsageError, binPath, runCli, tempDir, testEnv } from './helpers.js';

const usage = '사용법: gagyebu serve [--port <번호>] [--data <경로>]';

test('serve는 실제 포트를 알리고 SIGTERM으로 정상 종료한다', { timeout: 10000 }, async (t) => {
  const env = testEnv(tempDir(t));
  const child = spawn(process.execPath, [binPath, 'serve', '--port', '0', '--data', env.GAGYEBU_DATA], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
    await closed;
  });

  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });

  const lines = createInterface({ input: child.stdout });
  const [line] = await Promise.race([
    once(lines, 'line'),
    closed.then(([code, signal]) => assert.fail(`시작 문구 전에 종료했습니다 (${code ?? signal}): ${stderr}`)),
  ]);
  const match = /^http:\/\/127\.0\.0\.1:(\d+) 에서 듣고 있습니다 \(Ctrl\+C로 끝냅니다\)$/.exec(line);
  assert.ok(match, line);
  const port = Number(match[1]);
  assert.ok(port > 0 && port <= 65535);

  const response = await fetch(`http://127.0.0.1:${port}/api/transactions`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), []);

  assert.equal(child.kill('SIGTERM'), true);
  assert.deepEqual(await closed, [0, null]);
  assert.equal(stdout, `${line}\n`);
  assert.equal(stderr, '');
});

test('사용 중인 포트는 오류 한 줄과 종료 코드 1을 반환한다', async (t) => {
  const env = testEnv(tempDir(t));
  const occupied = createServer();
  occupied.listen(0, '127.0.0.1');
  await once(occupied, 'listening');
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  const port = String(occupied.address().port);

  const { status, stdout, stderr } = runCli(['serve', '--port', port], { env });
  assert.equal(status, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, `오류: 포트 ${withParticle(port, '을/를')} 쓸 수 없습니다\n`);
});

test('serve는 잘못된 옵션과 인자를 사용법 오류로 보고한다', () => {
  for (const [args, message] of [
    ...['abc', '70000', '-1', ''].map((port) =>
      [['--port', port], `--port는 0에서 65535 사이의 정수여야 합니다: ${port}`]),
    [['--nope'], '알 수 없는 옵션입니다: --nope'],
    [['x'], '예상하지 않은 인자입니다: x'],
    [['--port'], '--port 값이 없습니다'],
    [['--data'], '--data 값이 없습니다'],
    [['--data', ''], '--data 값이 비었습니다'],
  ]) {
    assertUsageError(runCli(['serve', ...args]), message, usage);
  }
});

test('serve --help는 사용법 한 줄을 출력한다', () => {
  const { status, stdout, stderr } = runCli(['serve', '--help']);
  assert.equal(status, 0);
  assert.equal(stdout, `${usage}\n`);
  assert.equal(stderr, '');
});
