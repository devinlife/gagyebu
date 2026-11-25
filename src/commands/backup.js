import { backupDirectory, createBackup, listBackups } from '../backup.js';
import { formatTable, UNREADABLE } from '../format.js';
import { parseNonemptyOption } from '../input.js';
import { parseCommand, validateListJson } from '../options.js';
import { dataPath } from '../store.js';

export const name = 'backup';
export const order = 106;
export const summary = '데이터를 백업하거나 백업 목록을 보여 줍니다.';

const USAGE = '사용법: gagyebu backup [--list] [--json] [--dir <폴더>] [--data <경로>]';

export function run(argv) {
  const parsed = parseCommand(argv, {
    values: ['dir'],
    flags: ['list', 'json'],
  }, USAGE);
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { options } = parsed;
  validateListJson(options, USAGE);
  parseNonemptyOption(options.dir, 'dir', USAGE);
  const filePath = dataPath(options, USAGE);
  const directory = backupDirectory(filePath, options.dir);
  if (options.list) {
    printBackups(listBackups(directory), options.json);
  } else {
    const { path, count } = createBackup(filePath, directory);
    console.log(`백업했습니다: ${path} (거래 ${count}건)`);
  }
  return 0;
}

function printBackups(backups, json) {
  if (json) {
    const listing = backups.map(({ name, size, count }) => ({ name, size, transactions: count }));
    console.log(JSON.stringify(listing, null, 2));
  } else if (backups.length === 0) {
    console.log('백업이 없습니다.');
  } else {
    const rows = backups.map(({ name, size, count }) => [
      name, `${size.toLocaleString('en-US')}B`, count === null ? UNREADABLE : `${count}건`,
    ]);
    console.log(formatTable([['이름', '크기', '거래'], ...rows], { right: [1, 2] }));
  }
}
