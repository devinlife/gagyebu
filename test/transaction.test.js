import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeTransaction, parseId } from '../src/transaction.js';

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
    assert.equal(parseId(text), Number(text), text);
  }
  for (const text of ['0', '-1', '01', '1.5', '1e3', 'abc', '', ' 1', '+1', '9007199254740992', '1\n']) {
    assert.equal(parseId(text), null, JSON.stringify(text));
  }
});
