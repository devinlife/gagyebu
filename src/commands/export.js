import { statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { toCsv } from '../csv.js';
import { DataError, UsageError } from '../errors.js';
import { parseOptions } from '../options.js';
import { resolveDataPath } from '../store.js';
import { loadTransactions, parsePeriod } from './list.js';

export const summary = '거래를 CSV로 내보냅니다.';

const USAGE = '사용법: gagyebu export [--out <파일>] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--force] [--data <경로>]';

function checkOutputPath(out, dataPath, force) {
  if (!force && path.resolve(out) !== dataPath) {
    return;
  }
  const source = statSync(dataPath, { throwIfNoEntry: false, bigint: true });
  const target = statSync(out, { throwIfNoEntry: false, bigint: true });
  const sameFile = source !== undefined && target !== undefined
    && source.dev === target.dev && source.ino === target.ino;
  if ((force && sameFile) || (source === undefined && path.resolve(out) === dataPath)) {
    throw new DataError(`데이터 파일에는 내보낼 수 없습니다: ${out}`);
  }
}

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
  const { out, data, force } = options;
  if (out === '') {
    throw new UsageError('--out 값이 비었습니다', USAGE);
  }
  if (data === '') {
    throw new UsageError('--data 값이 비었습니다', USAGE);
  }
  if (force && out === undefined) {
    throw new UsageError('--force는 --out과 함께 써야 합니다', USAGE);
  }

  const { from, to } = parsePeriod(options, USAGE);
  const dataPath = resolveDataPath(data);
  const transactions = loadTransactions(dataPath).filter(({ date }) =>
    (from === undefined || from <= date) && (to === undefined || date <= to));
  const csv = toCsv(transactions);
  if (out === undefined) {
    process.stdout.write(csv);
    return 0;
  }

  try {
    checkOutputPath(out, dataPath, force);
    writeFileSync(out, `\uFEFF${csv}`, { flag: force ? 'w' : 'wx' });
  } catch (error) {
    if (error instanceof DataError) {
      throw error;
    }
    if (error.code === 'EEXIST') {
      throw new DataError(`이미 있는 파일입니다: ${out}`);
    }
    throw new DataError(`파일을 쓸 수 없습니다: ${out} (${error.code})`);
  }
  console.log(`${transactions.length}건을 내보냈습니다: ${out}`);
  return 0;
}
