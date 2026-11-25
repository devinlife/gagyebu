import { DataError, UsageError, unexpectedArgument } from './errors.js';
import { TYPES } from './types.js';
import { countUses } from './usage.js';

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

export function listCategories(data, type) {
  const { categories } = data;
  const types = type === undefined ? TYPES : [type];
  const list = {};
  for (const entryType of types) {
    const counts = countUses(data, 'category', entryType);
    list[entryType] = categories[entryType].map((name) => ({ name, count: counts.get(name)?.transactions ?? 0 }));
  }
  return list;
}

export function addCategory(categories, type, name) {
  if (findCategoryIndex(categories, type, name) !== -1) {
    throw new DataError(`이미 있는 분류입니다: ${name}`);
  }
  return { ...categories, [type]: [...categories[type], name] };
}

export function removeCategory(data, type, name) {
  const { categories } = data;
  const index = requireCategoryIndex(categories, type, name);
  const uses = countUses(data, 'category', type).get(name);
  const count = uses?.transactions ?? 0;
  if (count > 0) {
    throw new DataError(`${count}건의 거래가 쓰는 분류입니다: ${name}`);
  }
  if (uses?.budgets > 0) {
    throw new DataError(`예산이 있는 분류입니다: ${name}`);
  }
  return { ...categories, [type]: categories[type].toSpliced(index, 1) };
}
