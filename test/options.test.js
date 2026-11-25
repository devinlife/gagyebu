import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOptions } from '../src/options.js';

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
  assert.equal(parseOptions(['--x', '--data'], spec).error, '알 수 없는 옵션 --x');
  assert.equal(parseOptions(['--x=p'], spec).error, '알 수 없는 옵션 --x');
});

test('값 옵션 뒤에 값이 필요하다', () => {
  assert.equal(parseOptions(['--data'], spec).error, '--data 값이 없습니다');
  assert.equal(parseOptions(['--data', '--json'], spec).error, '--data 값이 없습니다');
});

test('깃발은 등호로 값을 받지 않는다', () => {
  assert.equal(parseOptions(['--json=true'], spec).error, '--json은 값을 받지 않습니다');
});
