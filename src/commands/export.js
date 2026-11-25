import { writeFileSync } from 'node:fs';
import { toCsv } from '../csv.js';
import { DataError, UsageError } from '../errors.js';
import { parsePeriod } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, validateDataOption } from '../store.js';
import { filterTransactions } from '../transaction.js';

export const summary = '거래를 CSV로 내보냅니다.';

const USAGE = '사용법: gagyebu export [--out <파일>] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['out', 'from', 'to', 'data'],
    flags: ['force', 'help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 0) {
    throw new UsageError(`예상하지 않은 인자 ${args[0]}`, USAGE);
  }
  const { out, force } = options;
  if (out === '') {
    throw new UsageError('--out 값이 비었습니다', USAGE);
  }
  validateDataOption(options, USAGE);
  if (force && out === undefined) {
    throw new UsageError('--force는 --out과 함께 써야 합니다', USAGE);
  }

  const { from, to } = parsePeriod(options, USAGE);
  const { data } = loadData(options, USAGE);
  const transactions = filterTransactions(data.transactions, { from, to });
  const csv = toCsv(transactions);
  if (out === undefined) {
    // console.log가 마지막 LF를 복원하고 닫힌 파이프의 쓰기 오류를 처리한다.
    console.log(csv.slice(0, -1));
    return 0;
  }

  try {
    writeFileSync(out, `\uFEFF${csv}`, { flag: force ? 'w' : 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new DataError(`이미 있는 파일입니다: ${out}`);
    }
    throw new DataError(`파일을 쓸 수 없습니다: ${out} (${error.code})`);
  }
  console.log(`${transactions.length}건을 내보냈습니다: ${out}`);
  return 0;
}
