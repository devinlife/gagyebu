import assert from 'node:assert/strict';
import { test } from 'node:test';

import { displayWidth, formatFileStamp, formatLocalDateTime, formatTable, formatWon, formatYearMonth, renderBars, withParticle } from '../src/format.js';

test('연월 제목은 연도와 월을 한글로 표시한다', () => {
  assert.equal(formatYearMonth('2026-02'), '2026년 2월');
});

test('마지막 글자의 받침에 맞춰 조사를 붙인다', () => {
  for (const [word, pair, expected] of [
    ['월급', '은/는', '월급은'], ['월급', '이/가', '월급이'],
    ['월급', '을/를', '월급을'], ['월급', '으로/로', '월급으로'],
    ['기타', '은/는', '기타는'], ['기타', '이/가', '기타가'],
    ['기타', '을/를', '기타를'], ['기타', '으로/로', '기타로'],
    ['서울', '으로/로', '서울로'], ['서울', '은/는', '서울은'],
    ['--help', '은/는', '--help는'], ['--json', '은/는', '--json은'],
    ['--clear-tags', '은/는', '--clear-tags는'], ['--force', '은/는', '--force는'],
    ['--from', '은/는', '--from은'], ['--to', '은/는', '--to는'],
    ['--tool', '은/는', '--tool은'], ['--tool', '으로/로', '--tool로'],
    ['--confirm', '은/는', '--confirm은'], ['SONG', '은/는', 'SONG은'],
    ['0', '이/가', '0이'], ['0', '으로/로', '0으로'],
    ['1', '이/가', '1이'], ['1', '으로/로', '1로'], ['2', '이/가', '2가'],
    ['2', '으로/로', '2로'], ['3', '이/가', '3이'], ['3', '으로/로', '3으로'],
    ['4', '이/가', '4가'], ['4', '으로/로', '4로'],
    ['5', '이/가', '5가'], ['5', '으로/로', '5로'],
    ['6', '이/가', '6이'], ['6', '으로/로', '6으로'],
    ['7', '이/가', '7이'], ['7', '으로/로', '7로'],
    ['8', '이/가', '8이'], ['8', '으로/로', '8로'],
    ['9', '이/가', '9가'], ['9', '으로/로', '9로'],
    ['10', '이/가', '10이'], ['?', '은/는', '?는'],
  ]) {
    assert.equal(withParticle(word, pair), expected, `${word} + ${pair}`);
  }
});

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
    ['漢', 2], ['〿', 1], ['１', 2], ['𠀀', 2], ['1,000원', 7], ['█▏▎▍▌▋▊▉', 8],
  ]) {
    assert.equal(displayWidth(text), width, text);
  }
});

test('막대는 최댓값을 기준으로 8분의 1칸 단위로 반올림한다', () => {
  assert.deepEqual(renderBars([8, 3], 10), ['█'.repeat(10), '███▊']);
  assert.deepEqual(renderBars([187, 188, 10000], 10), ['▏', '▎', '█'.repeat(10)]);
});

test('0원은 빈 막대로 표시하고 양수는 최소 한 조각을 표시한다', () => {
  assert.deepEqual(renderBars([0, 1, 10000], 10), ['', '▏', '█'.repeat(10)]);
  assert.deepEqual(renderBars([0, 0], 40), ['', '']);
  assert.deepEqual(renderBars([], 40), []);
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

test('로컬 시각을 월부터 초까지 두 자리로 표시한다', () => {
  assert.equal(formatLocalDateTime(new Date(2026, 0, 2, 3, 4, 5)), '2026-01-02 03:04:05');
});

test('파일 이름용 로컬 시각을 날짜와 시각으로 표시한다', () => {
  assert.equal(formatFileStamp(new Date(2026, 0, 2, 3, 4, 5)), '20260102-030405');
});
