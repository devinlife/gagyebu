import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCsv, readCsvRows, toCsv } from '../src/csv.js';
import { DataError } from '../src/errors.js';

const header = 'id,date,type,amount,category,account,memo,tags\r\n';
const transaction = {
  id: 1, date: '2026-02-03', type: 'transfer', amount: 5000,
  category: '식비', account: '현금', memo: '저녁', tags: ['회식', '법인'],
};

test('거래가 없으면 CSV 머리 줄만 출력한다', () => {
  assert.equal(toCsv([]), header);
});

test('거래 순서와 구분을 유지하고 태그를 세미콜론으로 잇는다', () => {
  const legacy = { id: 2, date: '2026-02-02', type: 'expense', amount: 30, category: '교통' };
  const nonArrayTags = { ...legacy, id: 3, tags: '회식' };
  assert.equal(toCsv([transaction, legacy, nonArrayTags]), header
    + '1,2026-02-03,transfer,5000,식비,현금,저녁,회식;법인\r\n'
    + '2,2026-02-02,expense,30,교통,,,\r\n'
    + '3,2026-02-02,expense,30,교통,,,\r\n');
});

test('쉼표와 따옴표 및 줄바꿈이 있는 CSV 칸을 감싼다', () => {
  const entry = {
    ...transaction, category: 'a,b', account: '그는 "좋다"', memo: '첫째\n둘째\r\n셋째\r넷째',
  };
  assert.equal(toCsv([entry]), header
    + '1,2026-02-03,transfer,5000,"a,b","그는 ""좋다""","첫째\n둘째\r\n셋째\r넷째",회식;법인\r\n');
});

test('글 칸과 각 태그의 수식을 막은 뒤 CSV 따옴표를 처리한다', () => {
  const entries = [
    { ...transaction, amount: -5000, category: '+1', account: '@현금', memo: '=SUM(A1)', tags: ['회식', '@x'] },
    { ...transaction, memo: '-3', tags: ['=a,b', 'a=b'] },
  ];
  assert.equal(toCsv(entries), header
    + "1,2026-02-03,transfer,-5000,'+1,'@현금,'=SUM(A1),회식;'@x\r\n"
    + "1,2026-02-03,transfer,5000,식비,현금,'-3,\"'=a,b;a=b\"\r\n");
});

test('BOM과 빈 줄을 처리하고 여러 줄에 걸친 레코드의 시작 줄을 센다', () => {
  assert.deepEqual(parseCsv('\uFEFFa,b\r\n\r\n"c,""d""\r\ne\nf",g\r\n\nh,i'), [
    { line: 1, cells: ['a', 'b'] },
    { line: 3, cells: ['c,"d"\r\ne\nf', 'g'] },
    { line: 7, cells: ['h', 'i'] },
  ]);
  assert.deepEqual(parseCsv('a\n""\n,\n'), [
    { line: 1, cells: ['a'] },
    { line: 2, cells: [''] },
    { line: 3, cells: ['', ''] },
  ]);
});

test('CSV 따옴표 형식이 잘못되면 레코드 시작 줄로 오류를 표시한다', () => {
  for (const [value, reason] of [
    ['"첫째\n둘째', '따옴표가 닫히지 않았습니다'],
    ['"a"b', '닫는 따옴표 뒤에 쉼표나 줄 끝이 필요합니다'],
    ['a"b', '따옴표로 감싸지 않은 칸에 따옴표나 줄바꿈이 있습니다'],
  ]) {
    assert.throws(() => parseCsv('a\n\n' + value), {
      constructor: DataError, message: 'CSV 형식이 잘못되었습니다: 3행: ' + reason,
    });
  }
});

test('수식 막기 표시를 떼고 원래 있던 작은따옴표를 보존한다', () => {
  const { date, amount, type } = transaction;
  const fields = { date, amount: String(amount), type, category: '=SUM', account: "'=x", memo: "'abc",
    tags: ["''@회사", '-a', "'abc"] };
  const csv = toCsv([{ ...transaction, ...fields }]);
  assert.ok(csv.includes(",'=SUM,''=x,'abc,'''@회사;'-a;'abc\r\n"));
  assert.deepEqual(readCsvRows(parseCsv(csv)), [{ line: 2, fields }]);
});

test('필수 칸을 확인하고 알려진 칸만 머리 줄 순서에 맞춰 읽는다', () => {
  assert.throws(() => readCsvRows(parseCsv('date,amount')), {
    constructor: DataError, message: '필요한 칸이 없습니다: type',
  });
  assert.throws(() => readCsvRows(parseCsv('\uFEFF\n')), {
    constructor: DataError, message: '필요한 칸이 없습니다: date, amount, type',
  });
  assert.deepEqual(readCsvRows(parseCsv(' id , type ,date,other,amount\n42,expense,2/3,x,5000\n42,expense')), [
    { line: 2, fields: { type: 'expense', date: '2/3', amount: '5000', tags: [] } },
    { line: 3, error: '칸 수가 머리 줄과 다릅니다(2개, 머리 줄 5개)' },
  ]);
});
