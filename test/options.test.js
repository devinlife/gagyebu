import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsageError } from '../src/errors.js';
import { parseCommand, parseOptions, parseSubcommand } from '../src/options.js';

const subcommands = {
  label: '규칙',
  usage: '규칙 사용법',
  usages: { add: '추가 사용법', list: '목록 사용법' },
  values: { add: ['tag'] },
  flags: { add: ['dry-run'] },
  repeatable: { add: ['tag'] },
};

test('하위 명령에 지정한 깃발과 반복 옵션만 받는다', () => {
  assert.deepEqual(parseSubcommand(['add', '--dry-run', '--tag=a', '--tag', 'b'], subcommands), {
    command: 'add', usage: subcommands.usages.add, args: [], options: { 'dry-run': true, tag: ['a', 'b'] },
  });
  assert.deepEqual(parseSubcommand(['list', '--json'], subcommands).options, { json: true });
  for (const option of ['--dry-run', '--tag']) {
    assert.throws(() => parseSubcommand(['list', option], subcommands), {
      message: `알 수 없는 옵션입니다: ${option}`, usage: subcommands.usages.list,
    });
  }
});

const spec = { values: ['data'], flags: ['json'] };

test('위치 인자의 순서를 유지한다', () => {
  assert.deepEqual(parseOptions(['a', '--data', 'p', 'b'], spec), {
    args: ['a', 'b'],
    options: { data: 'p' },
    error: null,
  });
});

test('값 옵션은 공백과 등호 형식을 지원한다', () => {
  assert.deepEqual(parseOptions(['--data=p'], spec), parseOptions(['--data', 'p'], spec));
  assert.deepEqual(parseOptions(['--data='], spec), {
    args: [],
    options: { data: '' },
    error: null,
  });
});

test('깃발은 다음 위치 인자를 소비하지 않는다', () => {
  assert.deepEqual(parseOptions(['--json', 'p'], spec), {
    args: ['p'],
    options: { json: true },
    error: null,
  });
});

test('모르는 옵션의 이름과 첫 오류만 돌려준다', () => {
  assert.equal(parseOptions(['--x', '--data'], spec).error, '알 수 없는 옵션입니다: --x');
  assert.equal(parseOptions(['--x=p'], spec).error, '알 수 없는 옵션입니다: --x');
});

test('값 옵션 뒤에 값이 필요하다', () => {
  assert.equal(parseOptions(['--data'], spec).error, '--data 값이 없습니다');
  assert.equal(parseOptions(['--data', '--json'], spec).error, '--data 값이 없습니다');
});

test('깃발은 등호로 값을 받지 않는다', () => {
  assert.equal(parseOptions(['--json=true'], spec).error, '--json은 값을 받지 않습니다');
});

test('반복 옵션은 공백과 등호 형식의 값을 순서대로 모은다', () => {
  const repeatableSpec = { values: ['tag', 'data'], repeatable: ['tag'] };
  assert.deepEqual(parseOptions(['--tag', 'a', '--tag=b', '--data=x', '--data=y'], repeatableSpec), {
    args: [],
    options: { tag: ['a', 'b'], data: 'y' },
    error: null,
  });
  assert.deepEqual(parseOptions(['--tag=a'], repeatableSpec).options, { tag: ['a'] });
  assert.deepEqual(parseOptions([], repeatableSpec).options, {});
  assert.equal(parseOptions(['--tag'], repeatableSpec).error, '--tag 값이 없습니다');
});

test('단일 명령은 옵션 오류와 남는 인자를 사용법과 함께 알린다', () => {
  const usage = '명령 사용법';
  assert.throws(() => parseCommand(['--help', '--x'], {}, usage), {
    constructor: UsageError, message: '알 수 없는 옵션입니다: --x', usage,
  });
  assert.throws(() => parseCommand(['x'], {}, usage), {
    constructor: UsageError, message: '예상하지 않은 인자입니다: x', usage,
  });
});

test('단일 명령은 지정된 위치 인자와 공통 데이터 옵션을 받는다', () => {
  assert.deepEqual(parseCommand(['x', '--data', 'p'], { positional: true }, '명령 사용법'), {
    args: ['x'], options: { data: 'p' },
  });
});

test('단일 명령과 하위 명령의 도움말은 출력 없이 돌려준다', (t) => {
  const log = t.mock.method(console, 'log', () => {});
  const usage = '명령 사용법';
  assert.deepEqual(parseCommand(['x', '--help'], {}, usage), { help: usage });
  assert.deepEqual(parseSubcommand(['--help'], subcommands), { help: '추가 사용법\n목록 사용법' });
  assert.deepEqual(parseSubcommand(['add', '--help'], subcommands), { help: '추가 사용법' });
  assert.equal(log.mock.callCount(), 0);
});
