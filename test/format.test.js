import assert from 'node:assert/strict';
import { test } from 'node:test';

import { formatWon } from '../src/format.js';

test('금액을 천 단위 쉼표와 원으로 표시한다', () => {
  for (const [amount, expected] of [
    [0, '0원'],
    [999, '999원'],
    [1000, '1,000원'],
    [12300, '12,300원'],
    [1234567, '1,234,567원'],
    [Number.MAX_SAFE_INTEGER, '9,007,199,254,740,991원'],
  ]) {
    assert.equal(formatWon(amount), expected);
  }
});
