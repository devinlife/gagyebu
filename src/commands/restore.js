import { DataError, UsageError, unexpectedArgument } from '../errors.js';
import { parseOptions } from '../options.js';
import { readBackup, readData, resolveDataPath, validateDataOption, writeData } from '../store.js';

export const name = 'restore';
export const order = 107;
export const summary = '백업에서 데이터를 복원합니다.';

const USAGE = '사용법: gagyebu restore <백업 파일> [--yes] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['data'],
    flags: ['yes', 'help'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (!args[0]) {
    throw new UsageError('백업 파일이 없습니다', USAGE);
  }
  if (args.length > 1) {
    throw unexpectedArgument(args[1], USAGE);
  }
  validateDataOption(options, USAGE);

  const [backupPath] = args;
  const backup = readBackup(backupPath);
  const filePath = resolveDataPath(options.data);
  const currentCount = readData(filePath).transactions.length;
  const backupCount = backup.transactions.length;
  if (!options.yes) {
    throw new DataError(`지금 데이터(거래 ${currentCount}건)를 백업(거래 ${backupCount}건)으로 바꾸려면 --yes를 붙이세요.`);
  }

  writeData(filePath, backup);
  console.log(`복원했습니다: ${backupPath} (거래 ${backupCount}건)`);
  return 0;
}
