import { DataError, UsageError, unexpectedArgument } from './errors.js';
import { EXPENSE, TYPES } from './types.js';

export const DEFAULT_CATEGORY = '기타';

export function parseName(args, usage, label = '분류') {
  if (args.length === 0) {
    throw new UsageError(`${label} 이름이 없습니다`, usage);
  }
  if (args.length > 1) {
    throw unexpectedArgument(args[1], usage);
  }
  const [input] = args;
  const name = input.trim();
  if (name === '' || [...name].length > 20) {
    throw new UsageError(`${label} 이름은 앞뒤 공백을 뺀 1~20자여야 합니다: ${input}`, usage);
  }
  return name;
}

export function findCategoryIndex(categories, type, name) {
  if (!TYPES.includes(type)) {
    return -1;
  }
  return categories[type].indexOf(name);
}

export function requireCategoryIndex(categories, type, name, suffix = '') {
  const index = findCategoryIndex(categories, type, name);
  if (index === -1) {
    throw new DataError(`없는 분류입니다: ${name}${suffix}`);
  }
  return index;
}

export function countCategories(transactions, type) {
  const counts = new Map();
  for (const transaction of transactions) {
    if (transaction.type === type) {
      const { category } = transaction;
      counts.set(category, (counts.get(category) ?? 0) + 1);
    }
  }
  return counts;
}

export function listCategories({ categories, transactions }, type) {
  const types = type === undefined ? TYPES : [type];
  const list = {};
  for (const entryType of types) {
    const counts = countCategories(transactions, entryType);
    list[entryType] = categories[entryType].map((name) => ({ name, count: counts.get(name) ?? 0 }));
  }
  return list;
}

export function addCategory(categories, type, name) {
  if (findCategoryIndex(categories, type, name) !== -1) {
    throw new DataError(`이미 있는 분류입니다: ${name}`);
  }
  return { ...categories, [type]: [...categories[type], name] };
}

export function removeCategory({ categories, transactions, budgets }, type, name) {
  const index = requireCategoryIndex(categories, type, name);
  const count = countCategories(transactions, type).get(name) ?? 0;
  if (count > 0) {
    throw new DataError(`${count}건의 거래가 쓰는 분류입니다: ${name}`);
  }
  if (type === EXPENSE && Object.hasOwn(budgets, name)) {
    throw new DataError(`예산이 있는 분류입니다: ${name}`);
  }
  return { ...categories, [type]: categories[type].toSpliced(index, 1) };
}
