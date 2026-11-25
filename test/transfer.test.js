import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { assertUsageError, currentData, readJson, runCli, tempDir, testEnv, transaction, writeJson } from './helpers.js';

const usage = '사용법: gagyebu transfer <금액> --from <계좌> --to <계좌> [--date YYYY-MM-DD] [--memo <글>] [--data <경로>]';

function fixture(t) {
  const env = testEnv(tempDir(t), { GAGYEBU_TODAY: '2026-02-10' });
  const file = env.GAGYEBU_DATA;
  const data = currentData({ accounts: [{ name: '현금', opening: 0 }, { name: '통장', opening: 0 }] });
  const original = writeJson(file, data);
  return { file, data, original, run: (...args) => runCli(['transfer', ...args], { env }) };
}

test('이체 한 건과 다음 번호를 저장하며 상대 날짜와 메모를 받는다', (t) => {
  const { file, data, run } = fixture(t);
  const options = ['--from', '현금', '--to', '통장'];
  for (const [id, others, date, memo] of [
    [1, [], '2026-02-10', ''],
    [2, ['--date', '어제', '--memo', '저축'], '2026-02-09', '저축'],
  ]) {
    const { status, stdout, stderr } = run('1만', ...options, ...others);
    assert.equal(status, 0, stderr);
    assert.equal(stderr, '');
    assert.equal(stdout, `이체했습니다: #${id} ${date} 현금→통장 10,000원\n`);
    data.transactions.push(transaction({ id, date, type: 'transfer', amount: 10000, category: '', toAccount: '통장', memo }));
    data.nextId += 1;
    assert.deepEqual(readJson(file), data);
  }
});

test('이체 사용법 오류는 파일을 바꾸지 않는다', (t) => {
  const { file, original, run } = fixture(t);
  const options = ['--from', '현금', '--to', '통장'];
  for (const [args, message] of [
    [options, '금액이 없습니다'],
    [['1', 'extra', ...options], '예상하지 않은 인자입니다: extra'],
    [['1', ...options, '--nope'], '알 수 없는 옵션입니다: --nope'],
    [['0', ...options], '금액은 양의 정수여야 합니다: 0'],
    [['1', '--to', '통장'], '--from이 없습니다'],
    [['1', '--from', '현금'], '--to가 없습니다'],
    [['1', '--from', '', '--to', '통장'], '--from 값이 비었습니다'],
    [['1', '--from', '현금', '--to', ''], '--to 값이 비었습니다'],
    [['1', '--to', '통장', '--from'], '--from 값이 없습니다'],
    [['1', '--from', '현금', '--to'], '--to 값이 없습니다'],
    [['1', '--from', '현금', '--to', '현금'], '보내는 계좌와 받는 계좌는 달라야 합니다'],
    [['1', ...options, '--date', '02-30'], '날짜는 YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 02-30'],
    [['1', ...options, '--date'], '--date 값이 없습니다'],
    [['1', ...options, '--memo'], '--memo 값이 없습니다'],
    [['1', ...options, '--data'], '--data 값이 없습니다'],
    [['1', ...options, '--data='], '--data 값이 비었습니다'],
  ]) {
    assertUsageError(run(...args), message, usage);
    assert.equal(readFileSync(file, 'utf8'), original);
  }
});

test('등록되지 않은 보내는 계좌나 받는 계좌는 데이터 오류로 보고한다', (t) => {
  const { file, original, run } = fixture(t);
  for (const [from, to] of [['미등록', '통장'], ['현금', '미등록']]) {
    const { status, stdout, stderr } = run('1', '--from', from, '--to', to);
    assert.equal(status, 1, stderr);
    assert.equal(stdout, '');
    assert.equal(stderr, '오류: 없는 계좌입니다: 미등록 (gagyebu account add로 더하세요)\n');
    assert.equal(readFileSync(file, 'utf8'), original);
  }
});

test('이체 도움말은 사용법 한 줄을 출력한다', (t) => {
  const { run } = fixture(t);
  const { status, stdout, stderr } = run('--help');
  assert.equal(status, 0, stderr);
  assert.equal(stderr, '');
  assert.equal(stdout, `${usage}\n`);
});
