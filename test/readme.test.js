import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { runCli } from './helpers.js';

test('README의 명령 표는 help와 같은 순서로 명령을 나열한다', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  const section = readme.split(/^## /m).find((part) => part.startsWith('명령별 사용법\n'));
  assert.ok(section, 'README에 명령별 사용법 절이 있어야 합니다');
  const documented = Array.from(section.matchAll(/^\| `([^`]+)` \|/gm), ([, name]) => name);
  assert.ok(documented.length > 0, 'README 명령 표에 명령이 있어야 합니다');

  const { status, stdout, stderr } = runCli(['help']);
  assert.equal(status, 0, stderr);
  const listed = Array.from(stdout.matchAll(/^ {2}(\S+) {2,}/gm), ([, name]) => name);
  assert.deepEqual(documented, listed);
});
