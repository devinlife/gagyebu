import { addCategory, listCategories, parseName, removeCategory } from '../category.js';
import { unexpectedArgument } from '../errors.js';
import { formatTable } from '../format.js';
import { parseType } from '../input.js';
import { parseSubcommand } from '../options.js';
import { loadData, writeData } from '../store.js';
import { EXPENSE, TYPE_LABELS } from '../types.js';

export const name = 'category';
export const order = 70;
export const summary = '분류 목록을 보고 분류를 더하거나 지웁니다.';

const USAGE = '사용법: gagyebu category list|add|rm [인자] [--옵션 값]';
const USAGES = {
  list: '사용법: gagyebu category list [--type expense|income] [--json] [--data <경로>]',
  add: '사용법: gagyebu category add <이름> [--type expense|income] [--data <경로>]',
  rm: '사용법: gagyebu category rm <이름> [--type expense|income] [--data <경로>]',
};

function printCategories(list, { json }) {
  if (json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  const rows = [['구분', '분류', '거래']];
  for (const [entryType, entries] of Object.entries(list)) {
    for (const { name, count } of entries) {
      rows.push([TYPE_LABELS[entryType], name, `${count}건`]);
    }
  }
  console.log(formatTable(rows, { right: [2] }));
}

export function run(argv) {
  const parsed = parseSubcommand(argv, {
    label: '분류', usage: USAGE, usages: USAGES,
    values: { list: ['type'], add: ['type'], rm: ['type'] },
  });
  if (parsed.help) {
    console.log(parsed.help);
    return 0;
  }
  const { command, args, options, usage } = parsed;
  const isList = command === 'list';
  if (isList && args.length > 0) {
    throw unexpectedArgument(args[0], usage);
  }
  const name = isList ? undefined : parseName(args, usage);
  if (options.type !== undefined) {
    parseType(options.type, usage);
  }
  const { filePath, data } = loadData(options, usage);
  if (isList) {
    printCategories(listCategories(data, options.type), options);
    return 0;
  }

  const { type = EXPENSE } = options;
  if (command === 'add') {
    const categories = addCategory(data.categories, type, name);
    writeData(filePath, { ...data, categories });
    console.log(`분류를 더했습니다: ${TYPE_LABELS[type]} ${name}`);
    return 0;
  }

  const categories = removeCategory(data, type, name);
  writeData(filePath, { ...data, categories });
  console.log(`분류를 지웠습니다: ${TYPE_LABELS[type]} ${name}`);
  return 0;
}
