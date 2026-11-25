import assert from 'node:assert/strict';
import { test } from 'node:test';

import { UsageError } from '../src/errors.js';
import { parseId, parseTags } from '../src/input.js';
import { describeTransaction } from '../src/transaction.js';

const usage = '사용법: gagyebu edit';

test('거래 확인 줄에 날짜, 유형, 금액, 분류와 메모를 표시한다', () => {
  assert.equal(describeTransaction({
    id: 1, date: '2026-02-28', type: 'income', amount: 12300, category: '월급', memo: '2월분',
  }), '#1 2026-02-28 수입 12,300원 월급 2월분');
  assert.equal(describeTransaction({
    id: 2, date: '2026-03-01', type: 'expense', amount: 5000, category: '식비', memo: '',
  }), '#2 2026-03-01 지출 5,000원 식비');
});

test('거래 번호는 앞에 0이나 부호가 없는 양의 안전한 정수만 받는다', () => {
  for (const text of ['1', '42', '9007199254740991']) {
    assert.equal(parseId(text, usage), Number(text), text);
  }
  for (const text of ['0', '-1', '01', '1.5', '1e3', 'abc', '', ' 1', '+1', '9007199254740992', '1\n']) {
    assert.throws(() => parseId(text, usage), {
      constructor: UsageError, message: `번호는 양의 정수여야 합니다: ${text}`, usage,
    }, JSON.stringify(text));
  }
});

test('태그에서 쉼표, 앞뒤 공백과 첫 #을 처리하고 중복을 뺀다', () => {
  assert.deepEqual(parseTags(['회식,법인', ' #회식 ', '##a']), ['회식', '법인', '#a']);
  assert.deepEqual(parseTags(['😀'.repeat(20)]), ['😀'.repeat(20)]);
  assert.deepEqual(parseTags(), []);
});

test('태그는 공백 없는 1~20자여야 한다', () => {
  for (const tag of ['', 'a,', '#', ' ', 'a b', '😀'.repeat(21)]) {
    assert.throws(() => parseTags([tag]), /태그는 공백 없는 1~20자여야 합니다/);
  }
});
