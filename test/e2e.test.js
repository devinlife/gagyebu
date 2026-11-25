import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { runCli, tempDir, testEnv } from './helpers.js';

function run(args, env) {
  const { status, stdout, stderr } = runCli(args, { env });
  assert.equal(status, 0, `${args.join(' ')}\n${stderr}`);
  return stdout;
}

function json(args, env) {
  return JSON.parse(run(args, env));
}

test('빈 가계부에 거래를 기록하고 집계, CSV 왕복, 되돌리기와 복원을 한다', (t) => {
  const dir = tempDir(t);
  const env = testEnv(dir, { GAGYEBU_TODAY: '2026-03-15' });

  run(['account', 'add', '통장', '--opening', '1000000'], env);
  run(['recurring', 'add', '50만', '--day', '10', '--type', 'expense',
    '--category', '주거', '--account', '통장', '--memo', '월세'], env);
  run(['recurring', 'apply'], env);
  const recurring = json(['list', '--json'], env);
  assert.deepEqual(recurring.map(({ date, category, amount }) => ({ date, category, amount })), [
    { date: '2026-03-10', category: '주거', amount: 500000 },
  ]);

  // 가져오기는 이체 행을 거부하므로 이체 날짜를 CSV 내보내기 범위 밖에 둔다.
  run(['transfer', '10만', '--from', '통장', '--to', '현금', '--date', '2026-03-01'], env);
  run(['add', '1만2천', '--category', '식비', '--memo', '점심'], env);
  run(['add', '3000', '--date', '어제', '--category', '교통'], env);
  run(['add', '300만', '--type', 'income', '--category', '급여', '--account', '통장'], env);
  run(['budget', 'set', '식비', '30만'], env);

  const summary = json(['summary', '--json'], env);
  assert.equal(summary.month, '2026-03');
  assert.equal(summary.income, 3000000);
  assert.equal(summary.expense, 515000);
  assert.equal(summary.net, 2485000);
  assert.equal(summary.expenseByCategory.find(({ category }) => category === '식비')?.budget, 300000);

  const report = json(['report', '--json'], env);
  assert.equal(report.year, 2026);
  const march = report.months.find(({ month }) => month === '2026-03');
  assert.equal(march?.income, 3000000);
  assert.equal(march?.expense, 515000);

  const stats = json(['stats', '--json', '--from', '2026-03-01', '--to', '2026-03-15'], env);
  assert.equal(stats.count, 3);
  assert.equal(stats.total, 515000);

  const balance = json(['balance', '--json'], env);
  assert.equal(balance.accounts.find(({ name }) => name === '현금')?.balance, 85000);
  assert.equal(balance.accounts.find(({ name }) => name === '통장')?.balance, 3400000);
  assert.equal(balance.total, 3485000);

  const csv = path.join(dir, 'x.csv');
  assert.match(run(['export', '--from', '2026-03-02', '--out', csv], env), /^4건을 내보냈습니다/);
  const importEnv = testEnv(dir, {
    GAGYEBU_DATA: path.join(dir, 'b.json'),
    GAGYEBU_TODAY: env.GAGYEBU_TODAY,
  });
  run(['account', 'add', '통장'], importEnv);
  // CSV는 거래만 담으므로 월 요약 전체를 대조할 수 있게 같은 예산을 설정한다.
  run(['budget', 'set', '식비', '30만'], importEnv);
  run(['import', csv], importEnv);
  assert.deepEqual(json(['summary', '--json'], importEnv), summary);

  run(['undo'], importEnv);
  assert.deepEqual(json(['list', '--json'], importEnv), []);
  const undone = json(['summary', '--json'], importEnv);
  assert.equal(undone.income, 0);
  assert.equal(undone.expense, 0);

  const original = json(['list', '--json'], env);
  assert.equal(original.length, 5);
  assert.equal(original.find(({ category }) => category === '교통')?.date, '2026-03-14');
  const lunch = original.find(({ memo }) => memo === '점심');
  assert.equal(lunch?.amount, 12000);
  assert.equal(lunch?.date, '2026-03-15');
  const backupDir = path.join(dir, 'bk');
  run(['backup', '--dir', backupDir], env);
  const backups = json(['backup', '--list', '--dir', backupDir, '--json'], env);
  assert.equal(backups.length, 1);
  assert.equal(backups[0].transactions, 5);
  run(['add', '1', '--category', '식비'], env);
  assert.equal(json(['list', '--json'], env).length, 6);
  run(['restore', path.join(backupDir, backups[0].name), '--yes'], env);
  assert.deepEqual(json(['list', '--json'], env), original);
  assert.deepEqual(json(['summary', '--json'], env), summary);
});
