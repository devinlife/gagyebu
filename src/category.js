import { UsageError } from './errors.js';
import { TYPES } from './types.js';

export function parseName(args, usage) {
  if (args.length === 0) {
    throw new UsageError('분류 이름이 없습니다', usage);
  }
  if (args.length > 1) {
    throw new UsageError(`예상하지 않은 인자 ${args[1]}`, usage);
  }
  const [input] = args;
  const name = input.trim();
  if (name === '' || [...name].length > 20) {
    throw new UsageError(`분류 이름은 앞뒤 공백을 뺀 1~20자여야 합니다: ${input}`, usage);
  }
  return name;
}

export function findCategoryIndex(categories, type, name) {
  if (!TYPES.includes(type)) {
    return -1;
  }
  return categories[type].indexOf(name);
}
