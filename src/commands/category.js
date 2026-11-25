import { findCategoryIndex, parseName } from '../category.js';
import { DataError, UsageError } from '../errors.js';
import { formatTable } from '../format.js';
import { parseType } from '../input.js';
import { parseOptions } from '../options.js';
import { loadData, writeData } from '../store.js';
import { EXPENSE, TYPES, TYPE_LABELS } from '../types.js';

export const summary = '분류 목록을 보고 분류를 더하거나 지웁니다.';

const USAGE = '사용법: gagyebu category list|add|rm [인자] [--옵션 값]';
const USAGES = {
  list: '사용법: gagyebu category list [--type expense|income] [--json] [--data <경로>]',
  add: '사용법: gagyebu category add <이름> [--type expense|income] [--data <경로>]',
  rm: '사용법: gagyebu category rm <이름> [--type expense|income] [--data <경로>]',
};

function countCategories(transactions, type) {
  const counts = new Map();
  for (const transaction of transactions) {
    if (transaction?.type === type) {
      const { category } = transaction;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return counts;
}

function listCategories({ categories, transactions }, { type, json }) {
  const types = type === undefined ? TYPES : [type];
  const list = {};
  for (const entryType of types) {
    const counts = countCategories(transactions, entryType);
    list[entryType] = categories[entryType].map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }
  if (json) {
    console.log(JSON.stringify(list, null, 2));
    return;
  }
  const rows = [['구분', '분류', '거래']];
  for (const entryType of types) {
    for (const { name, count } of list[entryType]) {
      rows.push([TYPE_LABELS[entryType], name, `${count}건`]);
    }
  }
  console.log(formatTable(rows, { right: [2] }));
}

export function run(argv) {
  const [command, ...operands] = argv;
  if (command === '--help') {
    const { args, error } = parseOptions(operands, {});
    if (error || args.length > 0) {
      throw new UsageError(error ?? `예상하지 않은 인자 ${args[0]}`, USAGE);
    }
    console.log(Object.values(USAGES).join('\n'));
    return 0;
  }
  if (command === undefined) {
    throw new UsageError('분류 하위 명령이 없습니다', USAGE);
  }
  if (!Object.hasOwn(USAGES, command)) {
    throw new UsageError(`알 수 없는 분류 하위 명령 ${command}`, USAGE);
  }

  const usage = USAGES[command];
  const isList = command === 'list';
  const { args, options, error } = parseOptions(operands, {
    values: ['type', 'data'],
    flags: isList ? ['help', 'json'] : ['help'],
  });
  if (error) {
    throw new UsageError(error, usage);
  }
  if (options.help) {
    console.log(usage);
    return 0;
  }
  if (isList && args.length > 0) {
    throw new UsageError(`예상하지 않은 인자 ${args[0]}`, usage);
  }
  const name = isList ? undefined : parseName(args, usage);
  if (options.type !== undefined) {
    parseType(options.type, usage);
  }
  const { filePath, data } = loadData(options, usage);
  if (isList) {
    listCategories(data, options);
    return 0;
  }

  const { type = EXPENSE } = options;
  const index = findCategoryIndex(data.categories, type, name);
  if (command === 'add') {
    if (index !== -1) {
      throw new DataError(`이미 있는 분류입니다: ${name}`);
    }
    data.categories[type].push(name);
    writeData(filePath, data);
    console.log(`분류를 더했습니다: ${TYPE_LABELS[type]} ${name}`);
    return 0;
  }

  if (index === -1) {
    throw new DataError(`없는 분류입니다: ${name}`);
  }
  const count = countCategories(data.transactions, type).get(name) ?? 0;
  if (count > 0) {
    throw new DataError(`${count}건의 거래가 쓰는 분류입니다: ${name}`);
  }
  if (type === EXPENSE && Object.hasOwn(data.budgets, name)) {
    throw new DataError(`예산이 있는 분류입니다: ${name}`);
  }
  data.categories[type].splice(index, 1);
  writeData(filePath, data);
  console.log(`분류를 지웠습니다: ${TYPE_LABELS[type]} ${name}`);
  return 0;
}
