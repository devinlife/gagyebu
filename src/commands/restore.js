import { currentCount, restoreBackup } from '../backup.js';
import { DataError, UsageError, unexpectedArgument } from '../errors.js';
import { parseOptions } from '../options.js';
import { dataPath, readBackup } from '../store.js';

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
  const filePath = dataPath(options, USAGE);

  const [backupPath] = args;
  const backup = readBackup(backupPath);
  const backupCount = backup.transactions.length;
  if (!options.yes) {
    const count = currentCount(filePath);
    const current = count === null ? '읽을 수 없음' : `거래 ${count}건`;
    throw new DataError(`지금 데이터(${current})를 백업(거래 ${backupCount}건)으로 바꾸려면 --yes를 붙이세요.`);
  }

  const { brokenPath } = restoreBackup(filePath, backup);
  console.log(`복원했습니다: ${backupPath} (거래 ${backupCount}건)`);
  if (brokenPath !== null) {
    console.log(`깨진 데이터 파일을 남겨 두었습니다: ${brokenPath}`);
  }
  return 0;
}
