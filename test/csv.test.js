import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toCsv } from '../src/csv.js';

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
