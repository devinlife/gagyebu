import { DataError, UsageError } from '../errors.js';
import { parseOptions } from '../options.js';
import { readData, resolveDataPath, writeData } from '../store.js';
import { describeTransaction, parseId } from '../transaction.js';

export const summary = '거래 하나를 지웁니다.';

const USAGE = '사용법: gagyebu rm <번호> [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['data'],
    flags: ['help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length === 0) {
    throw new UsageError('번호가 없습니다', USAGE);
  }
  if (args.length > 1) {
    throw new UsageError(`예상하지 않은 인자 ${args[1]}`, USAGE);
  }

  const id = parseId(args[0]);
  if (id === null) {
    throw new UsageError(`번호는 양의 정수여야 합니다: ${args[0]}`, USAGE);
  }
  if (options.data === '') {
    throw new UsageError('--data 값이 비었습니다', USAGE);
  }

  const filePath = resolveDataPath(options.data);
  const data = readData(filePath);
  if (!Array.isArray(data.transactions)) {
    throw new DataError(`데이터 파일을 읽을 수 없습니다: ${filePath} (transactions가 올바르지 않습니다)`);
  }

  const index = data.transactions.findIndex((entry) => entry.id === id);
  if (index === -1) {
    throw new DataError(`거래 #${id}가 없습니다`);
  }

  const [removed] = data.transactions.splice(index, 1);
  writeData(filePath, data);
  console.log(`삭제했습니다: ${describeTransaction(removed)}`);
  return 0;
}
