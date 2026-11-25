import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DataError, UsageError } from '../src/errors.js';
import { parseId, parseTags } from '../src/input.js';
import { DEFAULT_CATEGORIES } from '../src/store.js';
import {
  applyChanges, buildTransaction, describeTransaction, filterTransactions, importTransactions, listTotals, parseTransactionFields, removeTransaction,
} from '../src/transaction.js';
import { currentData, transaction } from './helpers.js';

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

test('기간, 구분, 분류, 태그와 검색어로 거르고 날짜와 번호 순으로 정렬한다', () => {
  const first = transaction({ id: 5, date: '2026-02-01', memo: 'Coupon' });
  const second = transaction({ id: 2, date: '2026-02-28', tags: ['점심', '법인'] });
  const third = transaction({ id: 3, date: '2026-02-28', tags: ['점심', '법인', '정기'] });
  const other = transaction({ id: 4, type: 'income', category: 'Coupon', tags: ['점심'] });
  const outside = transaction({ id: 1, date: '2026-03-01' });
  const entries = Object.freeze([third, outside, other, first, second].map(Object.freeze));

  assert.deepEqual(filterTransactions(entries, { from: '2026-02-01', to: '2026-02-28' }),
    [first, other, second, third]);
  assert.deepEqual(filterTransactions(entries, { type: 'income' }), [other]);
  assert.deepEqual(filterTransactions(entries, { category: 'Coupon' }), [other]);
  assert.deepEqual(filterTransactions(entries, { tags: ['법인', '점심'] }), [second, third]);
  assert.deepEqual(filterTransactions(entries, { query: 'COUPON' }), [first, other]);
  assert.deepEqual(filterTransactions(entries, { type: 'expense', query: '#정기' }), [third]);
  assert.deepEqual(entries.map(({ id }) => id), [3, 1, 4, 5, 2]);
});

test('거래 입력에 기본값을 적용하고 금액과 태그를 해석한다', (t) => {
  const date = '2026-02-10';
  const previous = process.env.GAGYEBU_TODAY;
  process.env.GAGYEBU_TODAY = date;
  t.after(() => {
    if (previous === undefined) {
      delete process.env.GAGYEBU_TODAY;
    } else {
      process.env.GAGYEBU_TODAY = previous;
    }
  });
  const defaults = { amount: 12000, type: 'expense', category: '기타', account: '현금', date, memo: '', tags: [] };
  assert.deepEqual(parseTransactionFields({ amount: '1만2천' }), defaults);
  assert.deepEqual(parseTransactionFields({ amount: '12,000원', tags: ['a,#b', 'a'] }), {
    ...defaults, tags: ['a', 'b'],
  });
});

test('거래 입력 오류는 기존 문구와 오류가 난 칸을 전달한다', () => {
  for (const [field, value, message] of [
    ['amount', undefined, '금액이 없습니다'],
    ['amount', '0', '금액은 양의 정수여야 합니다: 0'],
    ['type', 'x', '--type은 expense 또는 income이어야 합니다: x'],
    ['category', '', '--category 값이 비었습니다'],
    ['account', '', '--account 값이 비었습니다'],
    ['date', '2026-02-30', '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-30'],
    ['tags', ['a b'], '태그는 공백 없는 1~20자여야 합니다: a b'],
  ]) {
    assert.throws(() => parseTransactionFields({ amount: '1000', date: '2026-02-10', [field]: value }, usage), {
      constructor: UsageError, field, message, usage,
    });
  }
});

test('새 거래의 번호를 채우고 계좌를 확인하며 데이터는 그대로 둔다', () => {
  const data = Object.freeze(currentData({ nextId: 7, transactions: Object.freeze([]) }));
  const { date, type, amount, category, account, memo, tags } = transaction({});
  const fields = { date, type, amount, category, account, memo, tags };
  const filePath = '/data.json';
  assert.deepEqual(buildTransaction(data, fields, filePath), transaction({ id: 7 }));
  assert.throws(() => buildTransaction(data, { ...fields, category: '미등록' }, filePath), {
    constructor: DataError, field: 'category', message: '없는 분류입니다: 미등록 (gagyebu category add로 더하세요)',
  });
  assert.throws(() => buildTransaction(data, { ...fields, account: '미등록' }, filePath), {
    constructor: DataError, field: 'account', message: '없는 계좌입니다: 미등록 (gagyebu account add로 더하세요)',
  });
  assert.throws(() => buildTransaction({ ...data, nextId: 0 }, fields, filePath), {
    constructor: DataError, message: '데이터 파일을 읽을 수 없습니다: /data.json (nextId 또는 transactions가 올바르지 않습니다)',
  });
  assert.equal(data.nextId, 7);
  assert.deepEqual(data.transactions, []);
});

test('가져올 거래를 검증해 기존 거래의 중복을 세고 새 번호를 매긴다', () => {
  const existing = Object.freeze(transaction({ id: 5, amount: 12000 }));
  const data = currentData({ nextId: 7, transactions: Object.freeze([existing]) });
  data.accounts.push({ name: '카드', opening: 0 });
  Object.freeze(data);
  const expense = { date: existing.date, type: '지출', amount: '1만2천', category: '식비', account: '카드' };
  const income = { date: existing.date, type: '수입', amount: '12,300원', category: '', account: '' };
  const { added, duplicates, errors } = importTransactions(data, [
    { line: 2, fields: expense },
    { line: 3, fields: { ...expense, tags: ['#법인'], memo: '점심' } },
    { line: 4, fields: income },
    { line: 5, fields: income },
  ], '/data.json');
  assert.deepEqual(added, [
    transaction({ id: 7, amount: 12000, account: '카드', tags: ['법인'], memo: '점심' }),
    transaction({ id: 8, amount: 12300, type: 'income', category: '기타' }),
    transaction({ id: 9, amount: 12300, type: 'income', category: '기타' }),
  ]);
  assert.equal(duplicates, 1);
  assert.deepEqual(errors, []);
  assert.equal(data.nextId, 7);
  assert.deepEqual(data.transactions, [existing]);
});

test('중복 판정의 다섯 필드 중 하나라도 다르면 거래를 더한다', () => {
  const existing = transaction({ id: 1, category: '기타' });
  const data = currentData({ nextId: 2, transactions: [existing] });
  const fields = { date: '2026-02-10', type: 'expense', amount: '1000', category: '기타', memo: '' };
  const changes = [
    { date: '2026-02-11' },
    { type: 'income' },
    { amount: '2000' },
    { category: '식비' },
    { memo: '점심' },
  ];
  const rows = changes.map((change, index) => ({ line: index + 3, fields: { ...fields, ...change } }));
  assert.deepEqual(importTransactions(data, [{ line: 2, fields }, ...rows], '/data.json'), {
    added: [
      { ...existing, id: 2, date: '2026-02-11' },
      { ...existing, id: 3, type: 'income' },
      { ...existing, id: 4, amount: 2000 },
      { ...existing, id: 5, category: '식비' },
      { ...existing, id: 6, memo: '점심' },
    ],
    duplicates: 1,
    errors: [],
  });
});

test('가져올 각 행의 첫 오류를 모으고 중복도 검증한다', () => {
  const data = currentData({ nextId: 2, transactions: [transaction({ id: 1 })] });
  const fields = { date: '2026-02-10', type: 'expense', amount: '1000', category: '식비' };
  assert.deepEqual(importTransactions(data, [
    { line: 2, fields: { ...fields, category: '미등록' } },
    { line: 4, fields: { ...fields, amount: '0' } },
    { line: 5, fields: { ...fields, date: '2026-02-30', amount: '0' } },
    { line: 6, fields: { ...fields, type: 'transfer' } },
    { line: 7, fields: { ...fields, tags: ['a b'] } },
    { line: 8, error: '칸 수가 머리 줄과 다릅니다(2개, 머리 줄 4개)' },
  ], '/data.json'), {
    added: [],
    duplicates: 0,
    errors: [
      { line: 2, reason: '없는 분류입니다: 미등록 (gagyebu category add로 더하세요)' },
      { line: 4, reason: '금액은 양의 정수여야 합니다: 0' },
      { line: 5, reason: 'date는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-30' },
      { line: 6, reason: 'type은 expense·income·지출·수입 중 하나여야 합니다: transfer' },
      { line: 7, reason: '태그는 공백 없는 1~20자여야 합니다: a b' },
      { line: 8, reason: '칸 수가 머리 줄과 다릅니다(2개, 머리 줄 4개)' },
    ],
  });
});

test('수정할 필드를 새 거래에 적용하고 거래와 분류를 확인한다', () => {
  const original = Object.freeze(transaction({ id: 1 }));
  const data = Object.freeze({ categories: DEFAULT_CATEGORIES, transactions: Object.freeze([original]) });
  const updated = applyChanges(data, 1, { memo: '점심' });
  assert.deepEqual(updated, { ...original, memo: '점심' });
  assert.equal(original.memo, '');
  assert.throws(() => applyChanges(data, 1, { type: 'income' }), {
    constructor: DataError, message: '없는 분류입니다: 식비 (gagyebu category add로 더하세요)',
  });
  assert.throws(() => applyChanges(data, 2, { memo: '점심' }), {
    constructor: DataError, message: '거래 #2가 없습니다',
  });
});

test('목록 합계에서 이체 건수와 금액은 수입·지출과 따로 센다', () => {
  assert.deepEqual(listTotals([
    transaction({ id: 1, amount: 700 }),
    transaction({ id: 2, type: 'income', amount: 3000 }),
    transaction({ id: 3, type: 'transfer', amount: 5000, category: '', toAccount: '통장' }),
  ]), { count: 3, income: 3000, expense: 700, transferCount: 1, transfer: 5000 });
});

test('거래 삭제는 첫 일치 거래와 나머지를 돌려주고 입력을 보존한다', () => {
  const removed = Object.freeze(transaction({ id: 2 }));
  const sameId = Object.freeze(transaction({ id: 2, memo: '다른 거래' }));
  const other = Object.freeze(transaction({ id: 1 }));
  const transactions = Object.freeze([other, removed, sameId]);
  assert.deepEqual(removeTransaction(transactions, 2), { removed, transactions: [other, sameId] });
  assert.deepEqual(transactions, [other, removed, sameId]);
  assert.throws(() => removeTransaction(transactions, 3), {
    constructor: DataError, message: '거래 #3이 없습니다',
  });
});
