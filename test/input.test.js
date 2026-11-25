import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsageError } from '../src/errors.js';
import { parseAmount, parseDate, parseMonth, parseType, today } from '../src/input.js';

const usage = '사용법: gagyebu';
const env = { GAGYEBU_TODAY: '2026-03-01' };

test('금액 입력을 양의 정수로 해석한다', () => {
  for (const [input, expected] of [
    ['1', 1], ['012', 12], ['12000', 12000], ['12,000', 12000],
    ['1,234,567', 1234567], ['12,000원', 12000], ['5000원', 5000],
    ['1만2천', 12000], ['3만', 30000], ['1만 2000', 12000],
    ['1만 2천', 12000], ['5천', 5000], ['1만2천500', 12500],
    ['1만2천 500', 12500], ['1만2천원', 12000], ['1,000만', 10000000],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
    ['900719925474만991', Number.MAX_SAFE_INTEGER],
  ]) {
    assert.equal(parseAmount(input, usage), expected, input);
  }
});

test('금액의 잘못된 형식과 범위를 거부한다', () => {
  for (const input of [
    '', '0', '0원', '-5', '1.5', '1.5만', 'abc', '1,20,0', '1,0000',
    ',100', '100,', '원', '만', '천', '1만만', '1천2만', '12천', '0만',
    '1만10000', '1천1000', '1만 ', ' 1만', '1만  2000', '12,000 원',
    '1만 원', '1원원', '１２', '1e3', '9007199254740992', '900719925474만992', '1\n',
  ]) {
    assert.throws(() => parseAmount(input, usage), {
      constructor: UsageError, message: `금액은 양의 정수여야 합니다: ${input}`, usage,
    }, JSON.stringify(input));
  }
});

test('날짜 입력을 YYYY-MM-DD로 해석한다', () => {
  for (const [input, expected] of [
    ['2024-02-29', '2024-02-29'], ['0096-02-29', '0096-02-29'],
    ['오늘', '2026-03-01'], ['어제', '2026-02-28'], ['그제', '2026-02-27'],
    ['03-05', '2026-03-05'], ['12-31', '2026-12-31'],
    ['3/5', '2026-03-05'], ['03/05', '2026-03-05'], ['12/31', '2026-12-31'],
  ]) {
    assert.equal(parseDate(input, usage, undefined, env), expected, input);
  }
});

test('날짜를 계산할 때 윤일과 연도 경계를 반영한다', () => {
  for (const [base, input, expected] of [
    ['2024-03-01', '어제', '2024-02-29'], ['2024-03-01', '02-29', '2024-02-29'],
    ['2026-01-01', '어제', '2025-12-31'], ['2026-01-01', '그제', '2025-12-30'],
    ['0096-03-01', '어제', '0096-02-29'],
  ]) {
    assert.equal(parseDate(input, usage, undefined, { GAGYEBU_TODAY: base }), expected, `${base} ${input}`);
  }
  assert.throws(() => parseDate('어제', usage, undefined, { GAGYEBU_TODAY: '0000-01-01' }), {
    constructor: UsageError,
    message: '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 어제',
    usage,
  });
});

test('없는 날짜와 지원하지 않는 날짜 형식을 거부한다', () => {
  for (const input of [
    '2026-02-30', '2026-13-01', '2026-2-3', '02-29', '2/29', '13/1', '0/5',
    '00-10', '3-5', '2026/3/5', '1/2/3', ' 오늘', '내일', '', '2026-02-30\r\n추가 줄',
  ]) {
    assert.throws(() => parseDate(input, usage, undefined, env), {
      constructor: UsageError,
      message: `날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: ${input}`,
      usage,
    }, JSON.stringify(input));
  }
});

test('기준일이 없거나 비어 있으면 로컬 날짜를 쓴다', () => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  for (const localEnv of [{}, { GAGYEBU_TODAY: '' }]) {
    const before = formatter.format(new Date());
    const actual = today(localEnv);
    const after = formatter.format(new Date());
    assert.ok([before, after].includes(actual), actual);
  }
});

test('설정된 기준일을 검사하고 완전한 날짜는 기준일 없이 해석한다', () => {
  assert.equal(today(env), '2026-03-01');
  for (const input of ['2026-02-30', '오늘', '2026-3-1']) {
    assert.throws(() => today({ GAGYEBU_TODAY: input }), {
      constructor: UsageError,
      message: `GAGYEBU_TODAY는 YYYY-MM-DD 형식의 있는 날이어야 합니다: ${input}`,
      usage: '사용법은 gagyebu help를 보세요.',
    });
  }
  assert.equal(parseDate('2026-03-05', usage, undefined, { GAGYEBU_TODAY: 'x' }), '2026-03-05');
});

test('월 파서는 YYYY-MM 형식의 달만 받는다', () => {
  for (const month of ['0000-01', '2026-12']) {
    assert.equal(parseMonth(month, usage), month);
  }
  for (const month of ['2026-00', '2026-13', '2026-1', '']) {
    assert.throws(() => parseMonth(month, usage), {
      constructor: UsageError, message: `--month는 YYYY-MM 형식의 달이어야 합니다: ${month}`, usage,
    });
  }
});

test('구분 파서는 지출과 수입만 받는다', () => {
  for (const type of ['expense', 'income']) {
    assert.equal(parseType(type, usage), type);
  }
  for (const type of ['transfer', 'INCOME', '']) {
    assert.throws(() => parseType(type, usage), {
      constructor: UsageError, message: `--type은 expense 또는 income이어야 합니다: ${type}`, usage,
    });
  }
});
