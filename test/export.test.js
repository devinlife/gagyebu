import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync, readdirSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { binPath, runCli, tempDir, testEnv } from './helpers.js';

const usage = '사용법: gagyebu export [--out <파일>] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force] [--data <경로>]';
const header = 'id,date,type,amount,category,account,memo,tags\r\n';
const earlier = {
  id: 12, date: '2026-02-02', type: 'expense', amount: 1200,
  category: '식비', account: '현금', memo: '그는 "좋다",\n라고 했다',
};
const sameDay = {
  id: 2, date: '2026-02-03', type: 'expense', amount: 50,
  category: '식비', account: '현금', memo: '=SUM(A1)', tags: ['점심', '@회사'],
};
const sameDayIncome = {
  id: 10, date: '2026-02-03', type: 'income', amount: 5000,
  category: '급여', account: '현금', memo: '', tags: [],
};
const later = { ...sameDayIncome, id: 3, date: '2026-02-04' };
const earlierRow = '12,2026-02-02,expense,1200,식비,현금,"그는 ""좋다"",\n라고 했다",\r\n';
const sameDayRows = "2,2026-02-03,expense,50,식비,현금,'=SUM(A1),점심;'@회사\r\n"
  + '10,2026-02-03,income,5000,급여,현금,,\r\n';
const laterRow = '3,2026-02-04,income,5000,급여,현금,,\r\n';

function fixture(t) {
  const directory = tempDir(t, 'gagyebu-export-');
  const data = path.join(directory, 'data.json');
  const out = path.join(directory, '거래.csv');
  const env = testEnv(directory, { GAGYEBU_TODAY: '2026-02-04' });

  function run(...args) {
    return runCli(['export', ...args], { env, encoding: null });
  }

  function write(transactions = [sameDayIncome, later, earlier, sameDay]) {
    const nextId = Math.max(0, ...transactions.map(({ id }) => id)) + 1;
    const original = Buffer.from(JSON.stringify({ version: 1, nextId, transactions }));
    writeFileSync(data, original);
    return original;
  }

  return { directory, data, out, run, write };
}

function assertResult({ status, stdout, stderr }, expectedStatus, expectedOut = '', expectedError = '') {
  assert.equal(status, expectedStatus, stderr.toString());
  assert.deepEqual(stdout, Buffer.from(expectedOut));
  assert.equal(stderr.toString(), expectedError);
}

test('stdout에 거래를 날짜와 번호 순으로 BOM 없이 출력한다', (t) => {
  const { data, run, write } = fixture(t);
  const original = write();
  assertResult(run('--data', data), 0, header + earlierRow + sameDayRows + laterRow);
  assert.deepEqual(readFileSync(data), original);
});

test('데이터 파일이 없으면 머리 줄만 stdout에 출력한다', (t) => {
  const { directory, run } = fixture(t);
  assertResult(run(), 0, header);
  assert.deepEqual(readdirSync(directory), []);
});

test('stdout을 읽는 쪽이 먼저 닫혀도 오류 없이 종료한다', async (t) => {
  const { data, write } = fixture(t);
  write(Array.from({ length: 5000 }, (_, index) => ({ ...sameDay, id: index + 1 })));

  const child = spawn(process.execPath, [binPath, 'export', '--data', data], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const closed = once(child, 'close');
  child.stdout.destroy();
  let stderr = '';
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });

  assert.deepEqual(await closed, [0, null], stderr);
  assert.equal(stderr, '');
});

test('연도를 생략한 날짜와 상대 날짜를 해석하고 기간 양끝을 포함한다', (t) => {
  const { run, write } = fixture(t);
  write();
  assertResult(run('--from', '2/3', '--to', '어제'), 0, header + sameDayRows);
  assertResult(run('--from', '2/3'), 0, header + sameDayRows + laterRow);
  assertResult(run('--to', '어제'), 0, header + earlierRow + sameDayRows);
});

test('파일은 BOM으로 시작하며 stdout에는 내보낸 건수와 경로를 표시한다', (t) => {
  const { data, out, run, write } = fixture(t);
  const original = write();
  const period = ['--from', '2/3', '--to', '어제'];
  const stdout = run(...period);
  assertResult(stdout, 0, header + sameDayRows);
  assertResult(run('--out', out, ...period), 0, `2건을 내보냈습니다: ${out}\n`);
  assert.deepEqual(readFileSync(out), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), stdout.stdout]));
  assert.deepEqual(readFileSync(data), original);
});

test('이미 있는 파일은 --force를 줬을 때만 덮어쓴다', (t) => {
  const { out, run } = fixture(t);
  writeFileSync(out, '기존 파일');
  assertResult(run('--out', out), 1, '', `오류: 이미 있는 파일입니다: ${out}\n`);
  assert.equal(readFileSync(out, 'utf8'), '기존 파일');
  assertResult(run('--out', out, '--force'), 0, `0건을 내보냈습니다: ${out}\n`);
  assert.equal(readFileSync(out, 'utf8'), `\uFEFF${header}`);
});

test('파일 쓰기가 실패하면 오류를 표시한다', (t) => {
  const { directory, run } = fixture(t);
  const out = path.join(directory, 'missing', 'export.csv');
  assertResult(run('--out', out), 1, '', `오류: 파일을 쓸 수 없습니다: ${out} (ENOENT)\n`);
});

test('데이터 파일 자신과 그 파일을 가리키는 링크에는 내보내지 않는다', (t) => {
  const { data, out, run, write } = fixture(t);
  const original = write();
  symlinkSync(data, out);

  for (const [target, ...flags] of [[data, '--force'], [out, '--force'], [data]]) {
    assertResult(run('--out', target, ...flags), 1, '', `오류: 데이터 파일에는 내보낼 수 없습니다: ${target}\n`);
    assert.deepEqual(readFileSync(data), original);
  }
});

test('사용법 오류가 있으면 파일을 만들지 않고 오류와 사용법을 표시한다', (t) => {
  const { directory, out, run } = fixture(t);
  const invalidDate = 'YYYY-MM-DD·MM-DD·M/D·오늘·어제·그제 중 하나의 있는 날이어야 합니다: 2026-02-30';
  for (const [args, message] of [
    [['--out', out, '--nope'], '알 수 없는 옵션입니다: --nope'],
    [['--out', out, 'extra'], '예상하지 않은 인자입니다: extra'],
    [['--out', ''], '--out 값이 비었습니다'],
    [['--out', out, '--data', ''], '--data 값이 비었습니다'],
    [['--force'], '--force는 --out과 함께 써야 합니다'],
    [['--out', out, '--from', '2026-02-30'], `--from은 ${invalidDate}`],
    [['--out', out, '--to', '2026-02-30'], `--to는 ${invalidDate}`],
    [['--out', out, '--from', '오늘', '--to', '어제'], '--from이 --to보다 늦습니다: 2026-02-04 > 2026-02-03'],
    ...['out', 'from', 'to', 'data'].map((name) => [['--out', out, `--${name}`], `--${name} 값이 없습니다`]),
  ]) {
    assertResult(run(...args), 2, '', `오류: ${message}\n${usage}\n`);
    assert.deepEqual(readdirSync(directory), []);
  }
});

test('export --help는 사용법 한 줄을 출력한다', (t) => {
  const { run } = fixture(t);
  assertResult(run('--help'), 0, `${usage}\n`);
});
