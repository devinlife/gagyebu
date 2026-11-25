import { UsageError, unexpectedArgument } from '../errors.js';
import { formatTable } from '../format.js';
import { parseOptions } from '../options.js';
import { popHistory, readHistory, resolveDataPath, validateDataOption, writeJsonFile } from '../store.js';

export const name = 'undo';
export const order = 105;
export const summary = '마지막으로 바꾼 데이터를 되돌립니다.';

const USAGE = '사용법: gagyebu undo [--list] [--json] [--data <경로>]';

export function run(argv) {
  const { args, options, error } = parseOptions(argv, {
    values: ['data'],
    flags: ['help', 'list', 'json'],
  });
  if (error) {
    throw new UsageError(error, USAGE);
  }
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (args.length > 0) {
    throw unexpectedArgument(args[0], USAGE);
  }
  if (options.json && !options.list) {
    throw new UsageError('--json은 --list와 함께 써야 합니다', USAGE);
  }
  validateDataOption(options, USAGE);

  const filePath = resolveDataPath(options.data);
  const entries = readHistory(filePath);
  if (options.json) {
    const listing = entries.toReversed().map(({ at, command }) => ({ at, command }));
    console.log(JSON.stringify(listing, null, 2));
  } else if (entries.length === 0) {
    console.log('되돌릴 것이 없습니다.');
  } else if (options.list) {
    const rows = entries.toReversed().map(({ at, command }, index) => [String(index + 1), at, command]);
    console.log(formatTable([['번호', '시각', '명령'], ...rows], { right: [0] }));
  } else {
    const { at, command, data } = entries.at(-1);
    writeJsonFile(filePath, data, '데이터 파일');
    popHistory(filePath, entries);
    console.log(`되돌렸습니다: ${command} (${at})`);
  }
  return 0;
}
