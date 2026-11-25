import assert from 'node:assert/strict';
import { test } from 'node:test';

import { displayWidth, formatTable, formatWon } from '../src/format.js';

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

test('한글과 넓은 글자는 두 칸으로 세고 ASCII는 한 칸으로 센다', () => {
  for (const [text, width] of [
    ['', 0], ['abc', 3], ['식비', 4], ['점심 2인', 8], ['ᄀ', 2], ['ㄱ', 2],
    ['漢', 2], ['〿', 1], ['１', 2], ['𠀀', 2], ['1,000원', 7],
  ]) {
    assert.equal(displayWidth(text), width, text);
  }
});

test('표는 지정한 칸을 오른쪽으로 맞추고 줄 끝의 공백을 없앤다', () => {
  const rows = [['번호', '이름'], ['1', '가나'], ['10', 'a']];
  assert.equal(formatTable(rows, { right: [0] }), '번호  이름\n   1  가나\n  10  a');
});

test('한글과 영문이 섞여도 다음 칸의 표시 위치가 같다', () => {
  const rows = [['분류', '메모'], ['식비 A', '점심'], ['Cafe', 'coffee']];
  const lines = formatTable(rows).split('\n');
  assert.deepEqual(lines.map((line, index) => {
    return displayWidth(line.slice(0, line.indexOf(rows[index][1])));
  }), [8, 8, 8]);
});
